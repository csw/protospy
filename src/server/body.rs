use std::task::Poll;

use hyper::body::Body;
use pin_project_lite::pin_project;

use crate::server::op::BodyTracker;

pin_project! {
    pub struct BodyWrapper {
        #[pin]
        pub base: hyper::body::Incoming,
        tracker: BodyTracker,
    }
}

impl BodyWrapper {
    pub fn new(base: hyper::body::Incoming, tracker: BodyTracker) -> Self {
        Self { base, tracker }
    }
}

impl Body for BodyWrapper {
    type Data = <hyper::body::Incoming as hyper::body::Body>::Data;
    type Error = <hyper::body::Incoming as hyper::body::Body>::Error;

    fn poll_frame(
        mut self: std::pin::Pin<&mut Self>,
        cx: &mut std::task::Context<'_>,
    ) -> std::task::Poll<Option<Result<hyper::body::Frame<Self::Data>, Self::Error>>> {
        let res = self.as_mut().project().base.poll_frame(cx);
        match res {
            Poll::Ready(Some(Ok(ref frame))) => {
                if let Some(bytes) = frame.data_ref() {
                    eprintln!("read frame: {} bytes", bytes.len());
                    self.as_mut().tracker.saw_data(bytes);
                } else if let Some(trailers) = frame.trailers_ref() {
                    eprintln!("read {} trailers", trailers.len());
                    self.as_mut().tracker.saw_trailers(trailers);
                }

                if self.base.is_end_stream() {
                    self.as_mut().tracker.saw_eof().expect("reported OK");
                }
            }
            Poll::Ready(Some(Err(ref err))) => {
                eprintln!("read error: {:?}", err);
                self.as_mut()
                    .tracker
                    .saw_error(err.to_string())
                    .expect("reported OK");
            }
            // EOF
            Poll::Ready(None) => {
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
