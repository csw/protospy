use color_eyre::{Result, eyre::eyre};
use http::HeaderMap;
use hyper::body::Bytes;
use tracing::{info, warn};

use crate::server::conn::ConnInfo;

/// An HTTP request-response pair
#[derive(Debug)]
pub struct Op {
    conn: ConnInfo,
    request_parts: http::request::Parts,
    response_parts: http::response::Parts,
    request_body: TrackedBodyData,
    response_body: TrackedBodyData,
}

pub fn create_reporting(
    request: http::request::Parts,
    conn_info: ConnInfo,
) -> (OpReporter, OpReportingContext) {
    let (request_tracker, request_body_receiver) = BodyTracker::create_pair();
    let (response_tracker, response_body_receiver) = BodyTracker::create_pair();
    let (response_sender, response_receiver) = tokio::sync::oneshot::channel();
    (
        OpReporter {
            request,
            conn_info,
            request_body_chan: request_body_receiver,
            response_chan: response_receiver,
            response_body_chan: response_body_receiver,
        },
        OpReportingContext {
            request_tracker,
            response_tracker,
            response_sender,
        },
    )
}

pub struct OpReportingContext {
    pub request_tracker: BodyTracker,
    pub response_tracker: BodyTracker,
    pub response_sender: tokio::sync::oneshot::Sender<http::response::Parts>,
}

pub struct OpReporter {
    request: http::request::Parts,
    conn_info: ConnInfo,
    request_body_chan: tokio::sync::oneshot::Receiver<TrackedBodyData>,
    response_chan: tokio::sync::oneshot::Receiver<http::response::Parts>,
    response_body_chan: tokio::sync::oneshot::Receiver<TrackedBodyData>,
}

impl OpReporter {
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
}

pub struct BodyTracker {
    body: Option<TrackedBodyData>,
    done_chan: Option<tokio::sync::oneshot::Sender<TrackedBodyData>>,
}

impl BodyTracker {
    fn create_pair() -> (Self, tokio::sync::oneshot::Receiver<TrackedBodyData>) {
        let (sender, receiver) = tokio::sync::oneshot::channel();
        (
            Self {
                body: Some(TrackedBodyData::default()),
                done_chan: Some(sender),
            },
            receiver,
        )
    }

    pub fn saw_data(&mut self, bytes: &Bytes) {
        let body = self.mut_body();
        body.saw_body = true;
        body.data.extend_from_slice(bytes);
    }

    pub fn saw_trailers(&mut self, trailers: &HeaderMap) {
        let body = self.mut_body();
        for (key, value) in trailers.iter() {
            body.trailers.append(key, value.clone());
        }
    }

    pub fn saw_error(&mut self, err: String) -> Result<()> {
        self.mut_body().error = Some(err);
        self.report()
    }

    pub fn saw_eof(&mut self) -> Result<()> {
        self.mut_body().saw_eof = true;
        self.report()
    }

    fn mut_body(&mut self) -> &mut TrackedBodyData {
        self.body.as_mut().expect("not yet sent")
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
    fn drop(&mut self) {
        if self.done_chan.is_some() && self.body.is_some() {
            warn!("BodyTracker dropped without explicit report");
            self.report().expect("report succeeded");
        }
    }
}

#[derive(Debug)]
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
