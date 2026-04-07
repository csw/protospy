use std::task::Poll;

use hyper::body::Body;
use pin_project_lite::pin_project;
use strum::Display;
use tracing::{debug, instrument};

use crate::server::op::BodyTracker;

#[derive(Display, Debug)]
pub enum Direction {
    Request,
    Response,
}

pin_project! {
    pub struct BodyWrapper {
        pub direction: Direction,
        #[pin]
        pub base: hyper::body::Incoming,
        tracker: BodyTracker,
    }
}

impl BodyWrapper {
    pub fn new(direction: Direction, base: hyper::body::Incoming, tracker: BodyTracker) -> Self {
        Self {
            direction,
            base,
            tracker,
        }
    }
}

impl Body for BodyWrapper {
    type Data = <hyper::body::Incoming as hyper::body::Body>::Data;
    type Error = <hyper::body::Incoming as hyper::body::Body>::Error;

    #[instrument(skip(self, cx), fields(direction = %self.direction))]
    fn poll_frame(
        mut self: std::pin::Pin<&mut Self>,
        cx: &mut std::task::Context<'_>,
    ) -> std::task::Poll<Option<Result<hyper::body::Frame<Self::Data>, Self::Error>>> {
        let res = self.as_mut().project().base.poll_frame(cx);
        match res {
            Poll::Ready(Some(Ok(ref frame))) => {
                let at_eof = self.base.is_end_stream();

                if let Some(bytes) = frame.data_ref() {
                    debug!(event = "read_frame", len = bytes.len(), at_eof = at_eof,);
                    self.as_mut().tracker.saw_data(bytes);
                } else if let Some(trailers) = frame.trailers_ref() {
                    debug!(
                        event = "read_trailers",
                        count = trailers.len(),
                        at_eof = at_eof,
                    );
                    self.as_mut().tracker.saw_trailers(trailers);
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
