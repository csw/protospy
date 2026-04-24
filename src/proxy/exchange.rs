use std::fmt::Debug;
use std::result::Result as StdResult;
use std::sync::Arc;

use chrono::prelude::*;
use color_eyre::Result;
use futures::Stream;
use http::HeaderMap;
use hyper::body::Bytes;
use serde::{Serialize, Serializer};
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
pub struct Exchange {
    #[serde(serialize_with = "serialize_id")]
    exchange_id: Id,
    timestamp: Timestamp,
}

pub trait EventReporterService: Send + Sync + Debug {
    fn should_report(&self) -> bool;
    fn make_reporter(&self, exchange: Exchange) -> Box<dyn EventReporter>;
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
    exchange: Exchange,
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

impl Exchange {
    pub fn new() -> Self {
        Self {
            exchange_id: Id::new(),
            timestamp: Utc::now(),
        }
    }
}

impl Default for Exchange {
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

    fn make_reporter(&self, exchange: Exchange) -> Box<dyn EventReporter> {
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
