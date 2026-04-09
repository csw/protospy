use std::task::Poll;

use http::Response;
use hyper::body::{Body, Bytes, Incoming};
use pin_project_lite::pin_project;
use strum::Display;
use tracing::{debug, instrument};

use crate::server::op::BodyTracker;

#[derive(Display, Debug)]
pub enum Direction {
    Request,
    Response,
}

pub type ProxyResponse = Response<ProxyResponseBody>;

pub type ProxiedBody = http_body_util::Either<BodyWrapper, Incoming>;

pub type ProxyResponseBody = http_body_util::Either<ProxiedBody, http_body_util::Empty<Bytes>>;

pub fn wrapped_response_body(wrapper: BodyWrapper) -> ProxyResponseBody {
    ProxyResponseBody::Left(ProxiedBody::Left(wrapper))
}

pub fn passthrough_response_body(incoming: Incoming) -> ProxyResponseBody {
    ProxyResponseBody::Left(ProxiedBody::Right(incoming))
}

pub fn empty_response_body() -> ProxyResponseBody {
    ProxyResponseBody::Right(http_body_util::Empty::new())
}

pin_project! {
    pub struct BodyWrapper {
        pub direction: Direction,
        #[pin]
        pub base: hyper::body::Incoming,
        tracker: Box<BodyTracker>,
    }
}

impl BodyWrapper {
    pub fn new(
        direction: Direction,
        base: hyper::body::Incoming,
        tracker: Box<BodyTracker>,
    ) -> Self {
        Self {
            direction,
            base,
            tracker,
        }
    }
}

type WrappedBodyData = <hyper::body::Incoming as hyper::body::Body>::Data;
type WrappedBodyError = <hyper::body::Incoming as hyper::body::Body>::Error;

type BodyPollResult = Option<Result<hyper::body::Frame<WrappedBodyData>, WrappedBodyError>>;

impl Body for BodyWrapper {
    type Data = WrappedBodyData;
    type Error = WrappedBodyError;

    #[instrument(skip(self, cx), fields(direction = %self.direction))]
    fn poll_frame(
        mut self: std::pin::Pin<&mut Self>,
        cx: &mut std::task::Context<'_>,
    ) -> std::task::Poll<BodyPollResult> {
        let res = self.as_mut().project().base.poll_frame(cx);
        match res {
            Poll::Ready(Some(Ok(ref frame))) => {
                let at_eof = self.base.is_end_stream();

                if let Some(bytes) = frame.data_ref() {
                    debug!(event = "read_frame", len = bytes.len(), at_eof = at_eof,);
                    self.as_mut().tracker.saw_data(bytes).expect("reported OK");
                } else if let Some(trailers) = frame.trailers_ref() {
                    debug!(
                        event = "read_trailers",
                        count = trailers.len(),
                        at_eof = at_eof,
                    );
                    self.as_mut()
                        .tracker
                        .saw_trailers(trailers)
                        .expect("reported OK");
                }

                if self.base.is_end_stream() {
                    self.as_mut().tracker.saw_eof().expect("reported OK");
                }
            }
            Poll::Ready(Some(Err(ref err))) => {
                debug!(
                    event = "read_error",
                    error = ?err,
                );
                self.as_mut()
                    .tracker
                    .saw_error(err.to_string())
                    .expect("reported OK");
            }
            // EOF
            Poll::Ready(None) => {
                debug!(event = "body_eof",);

                self.as_mut().tracker.saw_eof().expect("reported OK");
            }
            Poll::Pending => (),
        }

        res
    }

    fn is_end_stream(&self) -> bool {
        self.base.is_end_stream()
    }

    fn size_hint(&self) -> hyper::body::SizeHint {
        self.base.size_hint()
    }
}
