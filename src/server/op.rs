use std::sync::Arc;

use color_eyre::{
    Result,
    eyre::{ErrReport, eyre},
};
use http::{HeaderMap, Response};
use hyper::body::Bytes;
use tokio::sync::oneshot;
use tracing::{info, instrument, warn};

use crate::server::{
    body::{self, BodyWrapper, Direction, ProxyResponse},
    client::{Client, ClientBody},
    conn::ConnInfo,
    monitor,
};
use crate::tokio_util::spawn_instrumented;

/// An HTTP request-response pair
#[derive(Debug)]
pub struct Op {
    conn: ConnInfo,
    request_parts: http::request::Parts,
    response_parts: http::response::Parts,
    request_body: TrackedBodyData,
    response_body: TrackedBodyData,
}

pub type OpHandler = Box<dyn Fn(Op) -> Result<()> + Send>;

pub fn create_reporting(
    sender: monitor::Sender,
    request: http::request::Parts,
    conn_info: ConnInfo,
) -> (OpReporter, OpReportingContext) {
    let (request_tracker, request_body_receiver) = BodyTracker::create_pair(Direction::Request);
    let (response_tracker, response_body_receiver) = BodyTracker::create_pair(Direction::Response);
    let (response_sender, response_receiver) = oneshot::channel();
    (
        OpReporter {
            handler: Box::new(move |op| {
                sender.send(Arc::new(op))?;
                Ok(())
            }),
            request,
            conn_info,
            request_body_chan: request_body_receiver,
            response_chan: response_receiver,
            response_body_chan: response_body_receiver,
        },
        OpReportingContext::Report {
            request_tracker: Some(Box::new(request_tracker)),
            response_tracker: Some(Box::new(response_tracker)),
            response_sender: Some(response_sender),
        },
    )
}

pub enum OpReportingContext {
    NoOp,
    Report {
        request_tracker: Option<Box<BodyTracker>>,
        response_tracker: Option<Box<BodyTracker>>,
        response_sender: Option<oneshot::Sender<http::response::Parts>>,
    },
}

impl OpReportingContext {
    pub fn create_noop() -> OpReportingContext {
        info!("create_noop");
        Self::NoOp
    }

    pub fn report_response(&mut self, parts: &http::response::Parts) -> Result<()> {
        match self {
            Self::NoOp => Ok(()),
            Self::Report {
                response_sender: sender @ Some(_),
                ..
            } => sender
                .take()
                .unwrap()
                .send(parts.clone())
                .map_err(|_| eyre!("failed to send response data")),
            Self::Report {
                response_sender: None,
                ..
            } => Err(eyre!("already reported response")),
        }
    }

    pub fn forward_request(
        &mut self,
        client: &Client,
        request: http::Request<hyper::body::Incoming>,
    ) -> Result<hyper_util::client::legacy::ResponseFuture> {
        let (parts, incoming) = request.into_parts();
        match self {
            Self::NoOp => {
                Ok(client.request(http::Request::from_parts(parts, ClientBody::Left(incoming))))
            }

            Self::Report {
                request_tracker: tracker_opt @ Some(_),
                ..
            } => {
                let tracker = tracker_opt.take().unwrap();
                let wrapped = BodyWrapper::new(Direction::Request, incoming, tracker);
                Ok(client.request(http::Request::from_parts(parts, ClientBody::Right(wrapped))))
            }
            Self::Report {
                request_tracker: None,
                ..
            } => Err(eyre!("already wrapped request body")),
        }
    }

    pub fn tracked_response(
        &mut self,
        response: http::Response<hyper::body::Incoming>,
    ) -> Result<ProxyResponse> {
        let (parts, incoming) = response.into_parts();
        match self {
            Self::NoOp => Ok(http::Response::from_parts(
                parts,
                body::passthrough_response_body(incoming),
            )),
            Self::Report {
                response_tracker: tracker @ Some(_),
                response_sender: sender @ Some(_),
                ..
            } => {
                let sender = sender.take().unwrap();
                sender
                    .send(parts.clone())
                    .map_err(|_| eyre!("failed to send response data"))?;
                let tracker = tracker.take().unwrap();
                let wrapped = BodyWrapper::new(Direction::Response, incoming, tracker);
                Ok(Response::from_parts(
                    parts,
                    body::wrapped_response_body(wrapped),
                ))
            }
            _ => Err(eyre!("already reported response")),
        }
    }
}

pub struct OpReporter {
    handler: OpHandler,
    request: http::request::Parts,
    conn_info: ConnInfo,
    request_body_chan: oneshot::Receiver<TrackedBodyData>,
    response_chan: oneshot::Receiver<http::response::Parts>,
    response_body_chan: oneshot::Receiver<TrackedBodyData>,
}

impl OpReporter {
    pub fn start(self) -> Result<tokio::task::JoinHandle<Result<(), ErrReport>>> {
        let task_name = format!("report {} {}", self.request.method, self.request.uri);
        spawn_instrumented(task_name.as_str(), async move { self.run().await })
    }

    pub async fn run(self) -> Result<()> {
        let request_body = self.request_body_chan.await?;
        let response = self.response_chan.await?;
        let response_body = self.response_body_chan.await?;

        let op = Op {
            conn: self.conn_info,
            request_parts: self.request,
            request_body,
            response_parts: response,
            response_body,
        };
        (self.handler)(op)
    }
}

pub fn log_op(op: &Op) -> Result<()> {
    info!(
        "reporting op: conn={:?}, request={:?}, request body len={}, response={:?}, response body len={}",
        op.conn,
        op.request_parts,
        op.request_body.data.len(),
        op.response_parts,
        op.response_body.data.len()
    );
    Ok(())
}

#[derive(Debug)]
pub struct BodyTracker {
    body: Option<TrackedBodyData>,
    done_chan: Option<oneshot::Sender<TrackedBodyData>>,
    direction: Direction,
    span: tracing::Span,
}

impl BodyTracker {
    fn create_pair(direction: Direction) -> (Self, oneshot::Receiver<TrackedBodyData>) {
        let (sender, receiver) = oneshot::channel();
        (
            Self {
                body: Some(TrackedBodyData::default()),
                done_chan: Some(sender),
                direction,
                span: tracing::Span::current(),
            },
            receiver,
        )
    }

    #[instrument(parent = &self.span)]
    pub fn saw_data(&mut self, bytes: &Bytes) -> Result<()> {
        let body = self.mut_body()?;
        body.saw_body = true;
        body.data.extend_from_slice(bytes);
        Ok(())
    }

    #[instrument(parent = &self.span)]
    pub fn saw_trailers(&mut self, trailers: &HeaderMap) -> Result<()> {
        let body = self.mut_body()?;
        for (key, value) in trailers.iter() {
            body.trailers.append(key, value.clone());
        }
        Ok(())
    }

    #[instrument(parent = &self.span)]
    pub fn saw_error(&mut self, err: String) -> Result<()> {
        self.mut_body()?.error = Some(err);
        self.report()
    }

    #[instrument(parent = &self.span)]
    pub fn saw_eof(&mut self) -> Result<()> {
        self.mut_body()?.saw_eof = true;
        self.report()
    }

    fn mut_body(&mut self) -> Result<&mut TrackedBodyData> {
        self.body.as_mut().ok_or_else(|| eyre!("already sent body"))
    }

    fn report(&mut self) -> Result<()> {
        self.done_chan
            .take()
            .ok_or_else(|| eyre!("already reported completion"))?
            .send(
                self.body
                    .take()
                    .ok_or_else(|| eyre!("already took body data"))?,
            )
            .map_err(|_| eyre!("receiver closed prematurely"))
    }
}

impl Drop for BodyTracker {
    #[instrument(parent = &self.span, skip(self), fields(direction = %self.direction))]
    fn drop(&mut self) {
        if self.done_chan.is_some() && self.body.is_some() {
            // no body all, e.g. GET
            self.report().expect("report succeeded");
        }
    }
}

#[derive(Debug, PartialEq)]
pub struct TrackedBodyData {
    data: Vec<u8>,
    error: Option<String>,
    trailers: HeaderMap,
    saw_body: bool,
    saw_eof: bool,
}

impl TrackedBodyData {
    pub fn new() -> Self {
        Self {
            data: Vec::new(),
            error: None,
            trailers: HeaderMap::new(),
            saw_body: false,
            saw_eof: false,
        }
    }
}

impl Default for TrackedBodyData {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_tracker_eof_only() -> Result<()> {
        let (mut tracker, rcv) = BodyTracker::create_pair(Direction::Request);
        tracker.saw_eof()?;
        let body = rcv.blocking_recv()?;
        assert_eq!(
            body,
            TrackedBodyData {
                saw_eof: true,
                ..Default::default()
            }
        );
        Ok(())
    }

    #[test]
    fn test_tracker_data_2() -> Result<()> {
        let (mut tracker, rcv) = BodyTracker::create_pair(Direction::Request);
        tracker.saw_data(&Bytes::from_static(b"ab"))?;
        tracker.saw_data(&Bytes::from_static(b"cd"))?;
        tracker.saw_eof()?;
        let body = rcv.blocking_recv()?;
        assert_eq!(
            body,
            TrackedBodyData {
                data: b"abcd".into(),
                saw_body: true,
                saw_eof: true,
                ..Default::default()
            }
        );
        Ok(())
    }

    #[test]
    fn test_tracker_data_drop() -> Result<()> {
        let (tracker, rcv) = BodyTracker::create_pair(Direction::Request);
        {
            let mut t2 = tracker;
            t2.saw_data(&Bytes::from_static(b"ab"))?;
        }
        let body = rcv.blocking_recv()?;
        assert_eq!(
            body,
            TrackedBodyData {
                data: b"ab".into(),
                saw_body: true,
                saw_eof: false,
                ..Default::default()
            }
        );
        Ok(())
    }
}
