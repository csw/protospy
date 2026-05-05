use std::fmt::{self, Debug};
use std::pin::Pin;
use std::result::Result as StdResult;
use std::sync::Arc;
use std::task::ready;
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
use tracing::{error, instrument};

use crate::proxy::errors::BodyError;

#[derive(Copy, Clone, Display, PartialEq, Eq, PartialOrd, Hash, Debug, Serialize, ts_rs::TS)]
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
    fn check_ready(&mut self) -> Result<bool> {
        Ok(true)
    }
}

pub(crate) trait BodyAsyncFrameReporter: Send + Sync {
    fn dispatch(
        self: Arc<Self>,
        item: Arc<Option<BodyStreamItem>>,
    ) -> impl Future<Output = Result<()>> + Send + Sync + 'static;

    #[cfg(test)]
    fn dispatch_bare(
        self: &Arc<Self>,
        item: Option<BodyStreamItem>,
    ) -> impl Future<Output = Result<()>> + Send + Sync + 'static {
        self.clone().dispatch(Arc::new(item))
    }
}

type BoxFutureSync<'a, T> = Pin<Box<dyn Future<Output = T> + Send + Sync + 'a>>;

type DispatchFuture = BoxFutureSync<'static, Result<()>>;

pin_project! {
    pub(crate) struct BodyStreamWrapper<S, R>
    where S: Stream<Item = BodyStreamItem>, R: BodyAsyncFrameReporter
     {
        pub direction: Direction,
        #[pin]
        pub source: S,
        // The state held between reading a poll result from the stream and
        // returning it to the consumer, while we wait for the
        // asynchronous reporting operation to complete.
        //
        // If the state as a whole is Some, a poll result has been read from the
        // stream,
        state: Option<WrapperPollState>,
        // The reporter, or None if it has errored out.
        reporter: Option<Arc<R>>,
        span: tracing::Span,
    }
}

struct WrapperPollState {
    /// The poll result read from the stream, wrapped in an Arc for passing to
    /// the async reporting method.
    poll_result: Arc<Option<BodyStreamItem>>,
    /// The future from the call to the asynchronous reporting method, or None
    /// if that was skipped due to
    dispatch_future: Option<DispatchFuture>,
}

impl<S, R> BodyStreamWrapper<S, R>
where
    S: Stream<Item = BodyStreamItem>,
    R: BodyAsyncFrameReporter,
{
    pub fn new(direction: Direction, source: S, reporter: Arc<R>) -> Self {
        Self {
            direction,
            source,
            state: None,
            reporter: Some(reporter),
            span: tracing::Span::current(),
        }
    }
}

impl<S, R> Stream for BodyStreamWrapper<S, R>
where
    S: Stream<Item = BodyStreamItem>,
    R: BodyAsyncFrameReporter,
{
    type Item = S::Item;

    #[instrument(parent = &self.span, skip(self, cx), fields(direction = %self.direction))]
    fn poll_next(
        self: Pin<&mut Self>,
        cx: &mut std::task::Context<'_>,
    ) -> Poll<Option<Self::Item>> {
        let mut this = self.project();

        // The process here is:
        // 1. Poll the source stream to read a result.
        // 2. Start an async call to the reporter's dispatch method with an Arc reference to the result.
        // 3. Poll the future for the async call.
        // 4. Return the result to the consumer.

        // The reporting will be skipped if a previous reporting call has failed.

        // When this is polled, it needs to poll either the source stream or the future,
        // so our internal state is either:
        // - nothing, in which case we poll the source stream for an item
        // - an item and a future, in which case we poll the future

        if this.state.is_none() {
            // no item, poll the source stream
            let item = Arc::new(ready!(this.source.as_mut().poll_next(cx)));
            // got an item, start an async call to the reporter if needed
            let future_opt = this.reporter.clone().map(|reporter| -> DispatchFuture {
                Box::pin(reporter.dispatch(Arc::clone(&item)))
            });
            // store this state so that we resume from here
            *this.state = Some(WrapperPollState {
                poll_result: item,
                dispatch_future: future_opt,
            });
        }

        // have a stream poll result and maybe a future
        let WrapperPollState {
            dispatch_future, ..
        } = this
            .state
            .as_mut()
            .expect("invalid BodyStreamWrapper state, need future");

        // if we have a pending reporting call, poll it; this will propagate
        // a Poll::Pending result
        if let Some(future) = dispatch_future
            && let Err(err) = ready!(future.as_mut().poll(cx))
        {
            // log a reporting error, but return the poll result to
            // the caller regardless
            error!(event = "frame_reporter_dispatch_error", error = ?err);
            // assume future reporting attempts will fail, and remove the reporter
            // to skip them
            this.reporter.take();
        }
        // reported the item if needed, clear the state and return it
        let WrapperPollState { poll_result, .. } = this
            .state
            .take()
            .expect("invalid BodyStreamWrapper state, need item");
        Poll::Ready(
            Arc::into_inner(poll_result)
                .expect("invalid BodyStreamWrapper state, leaked item reference"),
        )
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

pub type RestStream = Pin<Box<Peekable<BodyStream<Internal>>>>;

pub struct PrefetchedParts {
    pub frames: Option<Vec<Frame<Data>>>,
    pub rest: Option<Pin<Box<Peekable<BodyStream<Internal>>>>>,
}

impl PrefetchedParts {
    pub fn assemble<F, S>(self, wrap_body: F) -> Result<Internal>
    where
        F: FnOnce(Pin<Box<Peekable<BodyStream<Internal>>>>) -> Result<S>,
        S: Stream<Item = BodyStreamItem> + Send + Sync + 'static,
    {
        Ok(match self {
            Self {
                frames: Some(frames),
                rest: Some(rest),
            } => wrapped_stream(frame_stream(frames).chain(wrap_body(rest)?)),
            Self {
                frames: Some(frames),
                rest: None,
            } => wrapped_stream(frame_stream(frames)),
            Self {
                frames: None,
                rest: Some(rest),
            } => wrapped_stream(wrap_body(rest)?),
            Self {
                frames: None,
                rest: None,
            } => wrapped(http_body_util::Empty::new()),
        })
    }

    pub fn data_bytes(&self) -> usize {
        self.frames
            .as_ref()
            .map(|frames| {
                frames
                    .iter()
                    .filter_map(|f| f.data_ref().map(|d| d.len()))
                    .sum()
            })
            .unwrap_or_default()
    }
}

const PEEK_DURATION: Duration = Duration::from_micros(100);

// Read any immediately-available data from an HTTP body, and return it in a
// structured form together with a Body which reproduces the original.
pub async fn collect_ready_data(body: Internal) -> Result<(FoundBodyData, PrefetchedParts)> {
    if body.is_end_stream() {
        // is_end_stream isn't propagated into a BodyStream, so we have to check
        // this here, before extract_ready_frames
        return Ok((
            FoundBodyData::NoBody,
            PrefetchedParts {
                frames: None,
                rest: None,
            },
        ));
    }

    let body_stream_p = BodyStream::new(body);

    let mut ready = body_stream_p.peekable().ready_chunks(32);
    let found = timeout(PEEK_DURATION, ready.next()).await;
    let mut rest = Box::pin(ready.into_inner());
    // Peek, because is_terminated() won't be true until we await again. This
    // isn't deterministic, even with a request coming in as a single packet,
    // and doesn't always catch termination.
    _ = timeout(Duration::ZERO, rest.as_mut().peek()).await;
    let terminated = rest.is_terminated();
    // N.B. BodyStream just returns false for is_end_stream()

    match (found, terminated) {
        // EOF
        (Err(_) | Ok(None), true) => Ok((
            FoundBodyData::NoBody,
            PrefetchedParts {
                frames: None,
                rest: None,
            },
        )),
        // timeout, no data available
        (Err(_), false) => Ok((
            FoundBodyData::NoneRead,
            PrefetchedParts {
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
                    PrefetchedParts {
                        frames: Some(frames),
                        rest: None,
                    },
                ),
                false => (
                    FoundBodyData::Partial(content),
                    PrefetchedParts {
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
pub mod test_support {
    use super::*;

    pub fn df(data: &[u8]) -> Frame<Bytes> {
        Frame::data(Bytes::copy_from_slice(data))
    }

    pub fn dfr(data: &[u8]) -> BodyStreamItem {
        Ok(Frame::data(Bytes::copy_from_slice(data)))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    mod wrapper {
        use std::sync::Mutex;

        use super::*;

        use futures::TryStreamExt;
        use tokio_test::stream_mock::StreamMockBuilder;

        struct DummyReporter {}

        impl BodyAsyncFrameReporter for DummyReporter {
            async fn dispatch(self: Arc<Self>, _item: Arc<Option<BodyStreamItem>>) -> Result<()> {
                Ok(())
            }
        }

        struct DummyErrorReporter {
            count: Mutex<u64>,
        }

        impl DummyErrorReporter {
            fn new() -> Self {
                Self {
                    count: Mutex::new(0),
                }
            }
        }

        impl BodyAsyncFrameReporter for DummyErrorReporter {
            async fn dispatch(self: Arc<Self>, _item: Arc<Option<BodyStreamItem>>) -> Result<()> {
                let mut count = self.count.lock().unwrap();
                *count += 1;
                Err(eyre!("ouch"))
            }
        }

        #[tokio::test]
        async fn test_basic() {
            let reporter = Arc::new(DummyReporter {});
            let stream_mock = StreamMockBuilder::new().next(dfr(b"ab")).build();
            let wrapper = BodyStreamWrapper::new(Direction::Request, stream_mock, reporter);
            let res: Vec<Frame<Data>> = wrapper.try_collect().await.unwrap();
            assert_eq!(res.len(), 1);
        }

        /// Verify that data is passed through the BodyStreamWrapper even if the reporter returns errors.
        #[tokio::test]
        async fn test_errors() {
            let reporter = Arc::new(DummyErrorReporter::new());
            let stream_mock = StreamMockBuilder::new()
                .next(dfr(b"ab"))
                .next(dfr(b"cd"))
                .build();
            let wrapper =
                BodyStreamWrapper::new(Direction::Request, stream_mock, Arc::clone(&reporter));
            let res: Vec<Frame<Data>> = wrapper.try_collect().await.unwrap();
            assert_eq!(res.len(), 2);
            let err_count = *reporter.count.lock().unwrap();
            // the error count should be 1, indicating that the wrapper didn't keep
            // attempting to report frames
            assert!(err_count == 1);
        }
    }

    mod collect_ready {
        use super::*;

        #[tokio::test]
        async fn test_basic() {
            let frames = vec![df(b"ab"), df(b"cd")];
            let body = frame_body(&frames).boxed();
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
