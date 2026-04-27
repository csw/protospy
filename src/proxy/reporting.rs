use std::mem::{self};
use std::result::Result as StdResult;
use std::sync::Arc;
use std::{fmt::Debug, sync::Mutex};

use chrono::prelude::*;
use color_eyre::Result;
use eyre::eyre;
use futures::Stream;
use http::HeaderMap;
use hyper::body::Bytes;
use serde::{Serialize, Serializer};
use tokio::time::Instant;
use tokio::{sync::mpsc, time::Duration};
use tracing::instrument;
use uid::IdU64 as IdT;

use crate::proxy::{
    body::{BodyReporter, BodyStreamItem, BodyStreamWrapper, Direction},
    conn::ConnInfo,
    event::{Event, EventMessage, flatten_headers},
    monitor::{self},
};

#[derive(Copy, Clone, Eq, PartialEq, Serialize)]
struct IdInner(());

type Id = IdT<IdInner>;

pub type Timestamp = DateTime<Utc>;

#[derive(Copy, Clone, Debug, Serialize)]
pub struct ExchangeMeta {
    #[serde(serialize_with = "serialize_id")]
    exchange_id: Id,
    timestamp: Timestamp,
}

pub trait EventReporterService: Send + Sync + Debug {
    fn should_report(&self) -> bool;
    fn make_reporter(&self, exchange: ExchangeMeta) -> Box<dyn EventReporter>;
}

pub trait EventReporter: Send + Sync + Debug {
    fn send_event(&self, event: Event) -> Result<()>;
}

#[derive(Debug)]
pub struct PublisherEventReporterService {
    publisher: monitor::Publisher,
}

#[derive(Debug, Clone)]
pub struct PublisherEventReporter {
    exchange: ExchangeMeta,
    publisher: monitor::Publisher,
}

/// An HTTP request-response pair
#[derive(Debug)]
pub struct FullExchange {
    pub conn: ConnInfo,
    pub request_parts: http::request::Parts,
    pub response_parts: http::response::Parts,
    pub request_body: TrackedBodyData,
    pub response_body: TrackedBodyData,
}

pub type ExchangeHandler = Box<dyn Fn(FullExchange) -> Result<()> + Send>;

impl ExchangeMeta {
    pub fn new() -> Self {
        Self {
            exchange_id: Id::new(),
            timestamp: Utc::now(),
        }
    }
}

impl Default for ExchangeMeta {
    fn default() -> Self {
        Self::new()
    }
}

impl PublisherEventReporterService {
    pub fn new(publisher: monitor::Publisher) -> Self {
        Self { publisher }
    }
}

impl EventReporterService for PublisherEventReporterService {
    fn should_report(&self) -> bool {
        self.publisher.has_listeners()
    }

    fn make_reporter(&self, exchange: ExchangeMeta) -> Box<dyn EventReporter> {
        Box::new(PublisherEventReporter {
            exchange,
            publisher: self.publisher.clone(),
        })
    }
}

impl EventReporter for PublisherEventReporter {
    fn send_event(&self, event: Event) -> Result<()> {
        let msg = Arc::new(EventMessage {
            exchange: self.exchange,
            event,
        });
        self.publisher.send(msg)?;
        Ok(())
    }
}

#[derive(Debug)]
pub struct BodyTracker {
    reporter: Box<dyn EventReporter>,
    direction: Direction,
    span: tracing::Span,
    seen: bool,
    ended: bool,
    total_bytes: usize,
}

pub fn tracked_body_stream<S>(
    reporter: Box<dyn EventReporter>,
    direction: Direction,
    stream: S,
    prev_bytes: usize,
) -> BodyStreamWrapper<S>
where
    S: Stream<Item = BodyStreamItem>,
{
    let tracker = Box::new(BodyTracker::new(reporter, direction, prev_bytes));
    BodyStreamWrapper::new(direction, stream, tracker)
}

pub fn buffered_tracked_body_stream<S>(
    reporter: Box<dyn EventReporter>,
    direction: Direction,
    stream: S,
    prev_bytes: usize,
) -> BodyStreamWrapper<S>
where
    S: Stream<Item = BodyStreamItem>,
{
    let tracker = Box::new(BodyTracker::new(reporter, direction, prev_bytes));
    BodyStreamWrapper::new(direction, stream, tracker)
}

impl BodyTracker {
    pub fn new(reporter: Box<dyn EventReporter>, direction: Direction, prev_bytes: usize) -> Self {
        Self {
            reporter,
            direction,
            span: tracing::Span::current(),
            seen: prev_bytes > 0,
            ended: false,
            total_bytes: prev_bytes,
        }
    }
}

impl BodyReporter for BodyTracker {
    #[instrument(parent = &self.span)]
    fn saw_data(&mut self, bytes: &Bytes) -> Result<()> {
        self.seen = true;
        self.total_bytes += bytes.len();
        self.reporter.send_event(Event::BodyData {
            direction: self.direction,
            bytes: bytes.len(),
            payload: bytes.into(),
        })
    }

    #[instrument(parent = &self.span)]
    fn saw_trailers(&mut self, trailers: &HeaderMap) -> Result<()> {
        self.reporter.send_event(Event::Trailers {
            direction: self.direction,
            entries: flatten_headers(trailers),
        })
    }

    #[instrument(parent = &self.span)]
    fn saw_error(&mut self, err: String) -> Result<()> {
        self.reporter.send_event(Event::Error {
            message: format!("body error ({}): {}", self.direction, err),
        })
    }

    #[instrument(parent = &self.span)]
    fn saw_eof(&mut self) -> Result<()> {
        self.reporter.send_event(Event::BodyEnd {
            direction: self.direction,
            seen: self.seen,
            total_bytes: self.total_bytes,
        })?;
        self.ended = true;
        Ok(())
    }
}

impl Drop for BodyTracker {
    #[instrument(parent = &self.span, skip(self), fields(direction = %self.direction))]
    fn drop(&mut self) {
        if !self.ended {
            _ = self.reporter.send_event(Event::BodyEnd {
                direction: self.direction,
                seen: self.seen,
                total_bytes: self.total_bytes,
            });
        }
    }
}

pub enum BodyEvent {
    Data,
    Trailers(HeaderMap),
    Error(String),
    EOF,
}

pub struct BufferedDataCollector {
    sender: mpsc::Sender<BodyEvent>,
    permit: Option<mpsc::OwnedPermit<BodyEvent>>,
    body_buffer: Arc<Mutex<Vec<u8>>>,
}

pub struct BufferedDataReporter {
    reporter: Box<dyn EventReporter>,
    direction: Direction,
    receiver: mpsc::Receiver<BodyEvent>,
    body_buffer: Arc<Mutex<Vec<u8>>>,
    seen: bool,
    ended: bool,
    total_bytes: usize,
}

pub fn create_buffered(
    reporter: Box<dyn EventReporter>,
    direction: Direction,
    prev_bytes: usize,
) -> (BufferedDataCollector, BufferedDataReporter) {
    let buffer = Arc::new(Default::default());
    let (sender, receiver) = mpsc::channel(1);
    let collector = BufferedDataCollector::new(sender, Arc::clone(&buffer));
    let data_reporter =
        BufferedDataReporter::new(reporter, direction, receiver, buffer, prev_bytes);
    (collector, data_reporter)
}

const BODY_FLUSH_INTERVAL: Duration = Duration::from_millis(100);

impl BufferedDataReporter {
    fn new(
        reporter: Box<dyn EventReporter>,
        direction: Direction,
        receiver: mpsc::Receiver<BodyEvent>,
        body_buffer: Arc<Mutex<Vec<u8>>>,
        prev_bytes: usize,
    ) -> Self {
        Self {
            reporter,
            direction,
            receiver,
            body_buffer,
            seen: prev_bytes > 0,
            ended: false,
            total_bytes: prev_bytes,
        }
    }

    pub async fn run(&mut self) -> Result<()> {
        let flush_sleep = tokio::time::sleep(Duration::ZERO);
        tokio::pin!(flush_sleep);

        loop {
            tokio::select! {
                event = self.receiver.recv() => {
                    match event {
                        Some(BodyEvent::Data) => {
                            self.seen = true;
                            if flush_sleep.is_elapsed() {
                                flush_sleep.as_mut().reset(Instant::now() + BODY_FLUSH_INTERVAL);
                            }

                        },
                        Some(BodyEvent::Trailers(trailers)) => {
                            self.reporter.send_event(Event::Trailers {
                                direction: self.direction,
                                entries: flatten_headers(&trailers),
                            })?;
                        },
                        Some(BodyEvent::Error(error)) => {
                            self.reporter.send_event(Event::Error {
                                message: format!("body error ({}): {}", self.direction, error),
                            })?;
                        },
                        Some(BodyEvent::EOF) => {
                            self.reporter.send_event(Event::BodyEnd {
                                direction: self.direction,
                                seen: self.seen,
                                total_bytes: self.total_bytes,
                            })?;
                            self.ended = true;
                        }
                        None => {
                            todo!("channel closed")
                        }
                    }
                },
                () = &mut flush_sleep => {
                    self.flush_data()?;
                }
            }
        }
    }

    fn flush_data(&mut self) -> Result<()> {
        let to_send: Vec<u8>;
        {
            let mut buffer = self.body_buffer.lock().unwrap();
            to_send = mem::take(buffer.as_mut());
            self.total_bytes += to_send.len();
        }
        self.reporter.send_event(Event::BodyData {
            direction: self.direction,
            bytes: to_send.len(),
            payload: to_send.into(),
        })?;
        Ok(())
    }
}

impl BufferedDataCollector {
    fn new(sender: mpsc::Sender<BodyEvent>, body_buffer: Arc<Mutex<Vec<u8>>>) -> Self {
        Self {
            sender,
            permit: None,
            body_buffer,
        }
    }

    fn send(&mut self, event: BodyEvent) -> Result<()> {
        if !self.is_ready()? {
            return Err(eyre!("must not send if not ready"));
        }

        self.permit.take().unwrap().send(event);
        Ok(())
    }

    fn try_get_permit(&mut self) -> Result<bool> {
        if self.permit.is_some() {
            return Ok(true);
        }
        match self.sender.clone().try_reserve_owned() {
            Ok(permit) => {
                self.permit = Some(permit);
                Ok(true)
            }
            Err(mpsc::error::TrySendError::Full(_)) => Ok(false),
            Err(e) => Err(e.into()),
        }
    }
}

impl BodyReporter for BufferedDataCollector {
    fn is_ready(&mut self) -> Result<bool> {
        self.try_get_permit()
    }

    fn saw_data(&mut self, bytes: &Bytes) -> Result<()> {
        {
            let mut buffer = self.body_buffer.lock().unwrap();
            buffer.extend_from_slice(bytes);
        }
        self.send(BodyEvent::Data)
    }

    fn saw_trailers(&mut self, trailers: &HeaderMap) -> Result<()> {
        self.send(BodyEvent::Trailers(trailers.clone()))
    }

    fn saw_error(&mut self, err: String) -> Result<()> {
        self.send(BodyEvent::Error(err))
    }

    fn saw_eof(&mut self) -> Result<()> {
        self.send(BodyEvent::EOF)
    }
}

#[derive(Debug, PartialEq)]
pub struct TrackedBodyData {
    pub data: Vec<u8>,
    pub error: Option<String>,
    pub trailers: HeaderMap,
    pub saw_body: bool,
    pub saw_eof: bool,
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

fn serialize_id<S: Serializer>(id: &Id, s: S) -> StdResult<S::Ok, S::Error> {
    s.serialize_u64(id.get())
}
