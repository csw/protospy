use std::mem::{self};
use std::result::Result as StdResult;
use std::sync::Arc;
use std::{fmt::Debug, sync::Mutex};

use chrono::prelude::*;
use color_eyre::Result;
use eyre::eyre;
use http::HeaderMap;
use hyper::body::Bytes;
use mockall::*;
use serde::{Serialize, Serializer};
use tokio::time::Instant;
use tokio::{sync::mpsc, time::Duration};
use uid::IdU64 as IdT;

use crate::proxy::{
    body::{BodyReporter, Direction},
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

#[automock]
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
    event_reporter: Box<dyn EventReporter>,
    direction: Direction,
    receiver: mpsc::Receiver<BodyEvent>,
    body_buffer: Arc<Mutex<Vec<u8>>>,
    seen: bool,
    total_bytes: usize,
}

pub fn create_buffered(
    event_reporter: Box<dyn EventReporter>,
    direction: Direction,
    prev_bytes: usize,
) -> (BufferedDataCollector, BufferedDataReporter) {
    let buffer = Arc::new(Default::default());
    // TODO: figure out why it can't get a permit if this isn't at least 3
    let (sender, receiver) = mpsc::channel(3);
    let collector = BufferedDataCollector::new(sender, Arc::clone(&buffer));
    let data_reporter =
        BufferedDataReporter::new(event_reporter, direction, receiver, buffer, prev_bytes);
    (collector, data_reporter)
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
        self.ensure_ready()?;

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

    fn ensure_ready(&mut self) -> Result<()> {
        if !self.try_get_permit()? {
            return Err(eyre!("BufferedDataCollector not ready"));
        }
        Ok(())
    }
}

impl BodyReporter for BufferedDataCollector {
    fn check_ready(&mut self) -> Result<bool> {
        self.try_get_permit()
    }

    fn saw_data(&mut self, bytes: &Bytes) -> Result<()> {
        self.ensure_ready()?;
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

const BODY_FLUSH_INTERVAL: Duration = Duration::from_millis(100);

impl BufferedDataReporter {
    fn new(
        event_reporter: Box<dyn EventReporter>,
        direction: Direction,
        receiver: mpsc::Receiver<BodyEvent>,
        body_buffer: Arc<Mutex<Vec<u8>>>,
        prev_bytes: usize,
    ) -> Self {
        Self {
            event_reporter,
            direction,
            receiver,
            body_buffer,
            seen: prev_bytes > 0,
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
                            self.event_reporter.send_event(Event::Trailers {
                                direction: self.direction,
                                entries: flatten_headers(&trailers),
                            })?;
                        },
                        Some(BodyEvent::Error(error)) => {
                            self.event_reporter.send_event(Event::Error {
                                message: format!("body error ({}): {}", self.direction, error),
                            })?;
                        },
                        Some(BodyEvent::EOF) => {
                            self.report_eof()?;
                            return Ok(());
                        }
                        None => {
                            self.report_eof()?;
                            return Ok(());
                        }
                    }
                },
                () = &mut flush_sleep => {
                    self.flush_data()?;
                }
            }
        }
    }

    fn report_eof(&mut self) -> Result<()> {
        self.flush_data()?;
        self.event_reporter.send_event(Event::BodyEnd {
            direction: self.direction,
            seen: self.seen,
            total_bytes: self.total_bytes,
        })?;
        Ok(())
    }

    fn flush_data(&mut self) -> Result<()> {
        let to_send: Vec<u8>;
        {
            let mut buffer = self.body_buffer.lock().unwrap();
            to_send = mem::take(buffer.as_mut());
            self.total_bytes += to_send.len();
        }
        self.event_reporter.send_event(Event::BodyData {
            direction: self.direction,
            bytes: to_send.len(),
            payload: to_send.into(),
        })?;
        Ok(())
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

#[cfg(test)]
mod tests {
    use super::*;
    use mockall::predicate::*;

    #[tokio::test]
    async fn test_buffered_basic() {
        use crate::proxy::event::Event;

        let mut event_reporter = Box::new(MockEventReporter::new());
        let mut seq = Sequence::new();
        event_reporter
            .expect_send_event()
            .with(eq(Event::BodyData {
                direction: Direction::Request,
                bytes: 4,
                payload: b"abcd".into(),
            }))
            .returning(|_| Ok(()))
            .times(1)
            .in_sequence(&mut seq);
        event_reporter
            .expect_send_event()
            .with(eq(Event::BodyEnd {
                direction: Direction::Request,
                seen: true,
                total_bytes: 4,
            }))
            .returning(|_| Ok(()))
            .times(1)
            .in_sequence(&mut seq);
        let (collector, mut reporter) = create_buffered(event_reporter, Direction::Request, 0);
        // TODO: time stuff
        let reporter_task = tokio::task::spawn(async move { reporter.run().await });
        {
            let mut collector = collector;
            collector.saw_data(&"ab".into()).unwrap();
            collector.saw_data(&"cd".into()).unwrap();
            collector.saw_eof().unwrap();
        }
        reporter_task.await.unwrap().unwrap();
    }
}
