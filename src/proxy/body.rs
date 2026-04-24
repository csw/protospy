use std::fmt::{self, Debug};
use std::pin::Pin;
use std::result::Result as StdResult;
use std::{task::Poll, time::Duration};

use color_eyre::{Result, eyre::eyre};
use futures::Stream;
use futures::stream::Peekable;
use futures::{
    StreamExt,
    stream::{self, FusedStream},
};
use http::{HeaderMap, Request, Response};
use http_body_util::{BodyExt, BodyStream, StreamBody};
use hyper::body::{Body, Bytes, Frame};
use mockall::*;
use pin_project_lite::pin_project;
use serde::Serialize;
use strum::Display;
use tokio::time::timeout;
use tracing::{debug, error, instrument, trace};

use crate::proxy::errors::BodyError;

#[derive(Copy, Clone, Display, Debug, Serialize)]
pub enum Direction {
    Request,
    Response,
}

pub type Data = Bytes;
pub type BodyFrame = Frame<Data>;
pub type Error = BodyError;
pub type BodyStreamItem = StdResult<Frame<Data>, Error>;

pub type Internal = http_body_util::combinators::BoxBody<Data, Error>;

pub fn wrapped<T>(body: T) -> Internal
where
    T: Body<Data = Data> + Send + Sync + 'static,
    T::Error: Into<BodyError>,
{
    Internal::new(body.map_err(|e| e.into()))
}

pub fn wrapped_stream<S>(s: S) -> Internal
where
    S: Stream<Item = BodyStreamItem> + Sync + Send + 'static,
{
    wrapped(StreamBody::new(s))
}

pub mod upstream {

    pub type RequestBody = super::Internal;

    pub fn wrapped_request<T>(body: T) -> super::Internal
    where
        T: hyper::body::Body<Data = super::Data, Error = super::Error> + Send + Sync + 'static,
    {
        super::Internal::new(body)
    }
}

pub mod downstream {

    pub fn empty_response() -> super::Internal {
        super::wrapped(http_body_util::Empty::new())
    }
}

pub type ProxyResponse = Response<Internal>;

pub fn map_request_body<I, O, F>(request: Request<I>, fun: F) -> Request<O>
where
    F: Fn(I) -> O,
{
    let (parts, body) = request.into_parts();
    Request::from_parts(parts, fun(body))
}

pub fn map_response_body<I, O, F>(response: Response<I>, fun: F) -> Response<O>
where
    F: Fn(I) -> O,
{
    let (parts, body) = response.into_parts();
    Response::from_parts(parts, fun(body))
}

#[automock]
pub trait BodyReporter: Send + Sync {
    fn saw_data(&mut self, bytes: &Bytes) -> Result<()>;
    fn saw_trailers(&mut self, trailers: &HeaderMap) -> Result<()>;
    fn saw_error(&mut self, err: String) -> Result<()>;
    fn saw_eof(&mut self) -> Result<()>;
}

pin_project! {
    pub struct BodyStreamWrapper<S>
    where S: Stream<Item = BodyStreamItem>
     {
        pub direction: Direction,
        #[pin]
        pub base: S,
        reporter: Box<dyn BodyReporter>,
        span: tracing::Span,
    }
}

impl<S> BodyStreamWrapper<S>
where
    S: Stream<Item = BodyStreamItem>,
{
    pub fn new(direction: Direction, base: S, reporter: Box<dyn BodyReporter>) -> Self {
        Self {
            direction,
            base,
            reporter,
            span: tracing::Span::current(),
        }
    }
}

impl<S> Stream for BodyStreamWrapper<S>
where
    S: Stream<Item = BodyStreamItem>,
{
    type Item = S::Item;

    #[instrument(parent = &self.span, skip(self, cx), fields(direction = %self.direction))]
    fn poll_next(
        self: Pin<&mut Self>,
        cx: &mut std::task::Context<'_>,
    ) -> Poll<Option<Self::Item>> {
        let mut this = self.project();
        let res = this.base.as_mut().poll_next(cx);
        match res {
            Poll::Ready(Some(Ok(ref frame))) => {
                if let Some(bytes) = frame.data_ref() {
                    trace!(event = "read_frame", len = bytes.len());
                    this.reporter.saw_data(bytes).expect("reported OK");
                } else if let Some(trailers) = frame.trailers_ref() {
                    trace!(event = "read_trailers", count = trailers.len());
                    this.reporter.saw_trailers(trailers).expect("reported OK");
                } else {
                    panic!("unhandled frame type: {frame:?}")
                };
            }
            Poll::Ready(Some(Err(ref err))) => {
                error!(
                    event = "read_error",
                    error = ?err,
                );
                this.reporter
                    .saw_error(err.to_string())
                    .expect("reported OK");
            }
            // EOF
            Poll::Ready(None) => {
                trace!(event = "body_eof",);

                this.reporter.saw_eof().expect("reported OK");
            }
            Poll::Pending => (),
        }

        res
    }
}

#[derive(Debug, PartialEq)]
pub enum FoundBodyData {
    NoBody,
    NoneRead,
    Partial(BodyContent),
    Complete(BodyContent),
}

impl FoundBodyData {
    pub fn trailers(&self) -> Option<&HeaderMap> {
        match self {
            Self::NoBody | Self::NoneRead => None,
            Self::Partial(BodyContent { trailers, .. }) => trailers.as_ref(),
            Self::Complete(BodyContent { trailers, .. }) => trailers.as_ref(),
        }
    }

    pub fn has_remaining(&self) -> bool {
        match self {
            Self::NoBody | Self::Complete(_) => false,
            Self::NoneRead | Self::Partial(_) => true,
        }
    }
}

#[derive(PartialEq)]
pub struct BodyContent {
    pub data: Vec<u8>,
    pub trailers: Option<HeaderMap>,
}

impl fmt::Debug for BodyContent {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.debug_struct("BodyContent")
            .field("data", &format_args!("[{} bytes]", self.data.len()))
            .field("trailers", &self.trailers)
            .finish()
    }
}

impl BodyContent {
    fn copy_from_frames(frames: &[Frame<Bytes>]) -> Self {
        let total_size: usize = frames
            .iter()
            .filter_map(|f| f.data_ref().map(|d| d.len()))
            .sum();
        let mut buf = Vec::new();
        buf.reserve_exact(total_size);
        for frame in frames.iter().filter_map(Frame::data_ref) {
            buf.extend(frame);
        }
        let trailers = frames.iter().find_map(Frame::trailers_ref);
        Self {
            data: buf,
            trailers: trailers.cloned(),
        }
    }
}

pub struct PrefetchedBody<B>
where
    B: Unpin + Body,
{
    pub frames: Option<Vec<Frame<Data>>>,
    pub rest: Option<Pin<Box<Peekable<BodyStream<B>>>>>,
}

const PEEK_DURATION: Duration = Duration::from_micros(100);

// Read any immediately-available data from an HTTP body, and return it in a
// structured form together with a Body which reproduces the original.
pub async fn collect_ready_data<B>(body: B) -> Result<(FoundBodyData, PrefetchedBody<B>)>
where
    B: hyper::body::Body<Data = Data, Error = Error> + Send + Sync + Unpin + 'static,
{
    debug!(
        "collect_ready_data: initial end_stream: {}",
        body.is_end_stream()
    );

    if body.is_end_stream() {
        // is_end_stream isn't propagated into a BodyStream, so we have to check
        // this here, before extract_ready_frames
        return Ok((
            FoundBodyData::NoBody,
            PrefetchedBody {
                frames: None,
                rest: None,
            },
        ));
    }

    let body_stream_p = BodyStream::new(body);

    let mut ready = body_stream_p.peekable().ready_chunks(32);
    let found = timeout(PEEK_DURATION, ready.next()).await;
    debug!(event = "extract_ready_frames", terminated = ready.is_terminated(), found = ?found);
    let mut rest = Box::pin(ready.into_inner());
    // Peek, because is_terminated() won't be true until we await again. This
    // isn't deterministic, even with a request coming in as a single packet,
    // and doesn't always catch termination.
    _ = timeout(Duration::ZERO, rest.as_mut().peek()).await;
    let terminated = rest.is_terminated();
    debug!(
        event = "extract_ready_frames peek term",
        terminated = rest.is_terminated(),
    );
    // N.B. BodyStream just returns false for is_end_stream()

    match (found, terminated) {
        // EOF
        (Err(_) | Ok(None), true) => Ok((
            FoundBodyData::NoBody,
            PrefetchedBody {
                frames: None,
                rest: None,
            },
        )),
        // timeout, no data available
        (Err(_), false) => Ok((
            FoundBodyData::NoneRead,
            PrefetchedBody {
                frames: None,
                rest: Some(rest),
            },
        )),
        (Ok(None), false) => Err(eyre!(
            "invalid collect_ready_data state, end of frames but not terminated"
        )),
        (Ok(Some(frames)), terminated) => {
            // TODO: deal with read error here
            let frames = frames
                .into_iter()
                .collect::<StdResult<Vec<Frame<_>>, _>>()?;
            let content = BodyContent::copy_from_frames(&frames);
            Ok(match terminated {
                true => (
                    FoundBodyData::Complete(content),
                    PrefetchedBody {
                        frames: Some(frames),
                        rest: None,
                    },
                ),
                false => (
                    FoundBodyData::Partial(content),
                    PrefetchedBody {
                        frames: Some(frames),
                        rest: Some(rest),
                    },
                ),
            })
        }
    }
}

pub fn frame_stream(frames: Vec<Frame<Data>>) -> impl Stream<Item = BodyStreamItem> {
    StreamBody::new(stream::iter(
        frames.into_iter().map(StdResult::Ok::<Frame<Data>, Error>),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use mockall::predicate::*;

    mod wrapper {
        use super::*;

        use futures::TryStreamExt;
        use tokio_test::stream_mock::StreamMockBuilder;

        #[tokio::test]
        async fn test_basic() {
            let stream_mock = StreamMockBuilder::new().next(dfr(b"ab")).build();
            let mut reporter = Box::new(MockBodyReporter::new());
            let mut seq = Sequence::new();
            reporter
                .expect_saw_data()
                .with(eq(Bytes::from_static(b"ab")))
                .returning(|_| Ok(()))
                .times(1)
                .in_sequence(&mut seq);
            reporter
                .expect_saw_eof()
                .times(1)
                .returning(|| Ok(()))
                .in_sequence(&mut seq);

            let wrapper = BodyStreamWrapper::new(Direction::Request, stream_mock, reporter);
            let res: Vec<Frame<Data>> = wrapper.try_collect().await.unwrap();
            assert_eq!(res.len(), 1);
        }
    }

    mod collect_ready {
        use super::*;

        #[tokio::test]
        async fn test_basic() {
            let frames = vec![df(b"ab"), df(b"cd")];
            let body = frame_body(&frames);
            let (found, prefetched) = collect_ready_data(body).await.unwrap();
            assert_eq!(
                found,
                FoundBodyData::Complete(BodyContent {
                    data: b"abcd".into(),
                    trailers: None
                })
            );
            assert_eq!(found.trailers(), None);
            compare_frames(&prefetched.frames.unwrap(), &frames);
            assert!(prefetched.rest.is_none());
        }

        fn compare_frames(a: &[Frame<Bytes>], b: &[Frame<Bytes>]) {
            assert!(
                a.iter()
                    .map(|f| f.data_ref())
                    .eq(b.iter().map(|f| f.data_ref()))
            );
            assert!(
                a.iter()
                    .map(|f| f.trailers_ref())
                    .eq(b.iter().map(|f| f.trailers_ref()))
            );
        }
    }

    mod stream_behavior {
        use std::time::Duration;

        use futures::{StreamExt, stream::FusedStream};
        use tokio::time::timeout;

        #[tokio::test]
        async fn test_ready_chunks_pending() {
            let p = tokio_stream::pending::<i32>();
            let mut ready = p.ready_chunks(8);
            // poll will block
            let found = timeout(Duration::ZERO, ready.next()).await;
            assert!(found.is_err())
        }

        #[tokio::test]
        async fn test_ready_chunks_empty() {
            let p = tokio_stream::empty::<i32>();
            let mut ready = p.ready_chunks(8);
            // poll will block
            let found = timeout(Duration::ZERO, ready.next()).await;
            assert_eq!(found, Ok(None))
        }

        #[tokio::test]
        async fn test_ready_chunks_some() {
            let p = tokio_stream::iter(vec![1, 2, 3]).chain(tokio_stream::pending());
            let mut ready = p.ready_chunks(8);
            // poll will block
            let found = timeout(Duration::ZERO, ready.next()).await;
            assert_eq!(found, Ok(Some(vec![1, 2, 3])));
        }

        #[tokio::test]
        async fn test_ready_chunks_complete() {
            let p = tokio_stream::iter(vec![1, 2, 3]);
            let mut ready = p.ready_chunks(8);
            // poll will block
            let found = timeout(Duration::ZERO, ready.next()).await;
            assert_eq!(found, Ok(Some(vec![1, 2, 3])));
            assert!(ready.is_terminated());
        }
    }

    fn df(data: &[u8]) -> Frame<Bytes> {
        Frame::data(Bytes::copy_from_slice(data))
    }

    fn dfr(data: &[u8]) -> BodyStreamItem {
        Ok(Frame::data(Bytes::copy_from_slice(data)))
    }

    fn frame_body(frames: &[Frame<Bytes>]) -> impl Body<Data = Data, Error = Error> + use<> {
        StreamBody::new(frame_stream(frames.iter().map(copy_frame).collect()))
    }

    fn copy_frame<T: Clone>(frame: &Frame<T>) -> Frame<T> {
        if let Some(data) = frame.data_ref() {
            Frame::data(data.clone())
        } else if let Some(trailers) = frame.trailers_ref() {
            Frame::trailers(trailers.clone())
        } else {
            panic!("invalid Frame")
        }
    }
}
