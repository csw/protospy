use std::{collections::HashMap, fs, path::PathBuf, sync::Arc};

use color_eyre::Result;
use eyre::Context;
use tokio::sync::broadcast;
use tracing::info;

use crate::proxy::{
    body::Direction,
    event::{Event, EventMessage},
    reporting::{self, ExchangeMeta},
};

pub type Payload = Arc<EventMessage>;
pub type Sender = broadcast::Sender<Payload>;
pub type Receiver = broadcast::Receiver<Payload>;

const BUFSIZE: usize = 256;

#[derive(Debug, Clone)]
pub struct Publisher {
    sender: Sender,
}

impl Publisher {
    pub fn new() -> Self {
        Self {
            sender: broadcast::Sender::new(BUFSIZE),
        }
    }

    pub fn has_listeners(&self) -> bool {
        self.sender.receiver_count() > 0
    }

    pub fn listener_count(&self) -> usize {
        self.sender.receiver_count()
    }

    pub fn sender(&self) -> Sender {
        self.sender.clone()
    }

    pub fn subscribe(&self) -> Receiver {
        self.sender.subscribe()
    }

    pub fn send(&self, payload: Payload) -> Result<usize> {
        Ok(self.sender.send(payload)?)
    }
}

impl Default for Publisher {
    fn default() -> Self {
        Self::new()
    }
}

pub fn logger_task_name(server: &str) -> String {
    format!("logger({})", server)
}

#[tracing::instrument(level = "info", skip(receiver))]
pub async fn run_logger(mut receiver: Receiver) -> Result<()> {
    loop {
        let val = receiver.recv().await?;
        let rendered = serde_json::to_string_pretty(val.as_ref())?;
        eprintln!("{}", rendered);
    }
}

#[tracing::instrument(level = "info", skip(receiver))]
pub async fn run_writer(receiver: Receiver, dir: PathBuf) -> Result<()> {
    let mut writer = Writer::new(receiver, dir);
    writer.run().await
}

struct Writer {
    receiver: Receiver,
    dir: PathBuf,
    frame_counters: HashMap<(reporting::Id, Direction), usize>,
}

impl Writer {
    fn new(receiver: Receiver, dir: PathBuf) -> Self {
        Self {
            receiver,
            dir,
            frame_counters: HashMap::new(),
        }
    }

    async fn run(&mut self) -> Result<()> {
        loop {
            let message = match self.receiver.recv().await {
                Ok(message) => message,
                Err(broadcast::error::RecvError::Closed) => return Ok(()),
                Err(err) => return Err(err).wrap_err("event receive error"),
            };
            let filename = self.event_filename(&message);
            let path = self.dir.join(filename);
            let rendered = serde_json::to_string_pretty(message.as_ref())?;
            fs::write(&path, rendered).wrap_err("error writing EventMessage")?;
            info!("Wrote {:?}", &path);
        }
    }

    fn event_filename(
        &mut self,
        EventMessage {
            exchange: ExchangeMeta { exchange_id, .. },
            direction,
            event,
        }: &EventMessage,
    ) -> String {
        let base = match event {
            Event::Request { .. } => "request".into(),
            Event::Response { .. } => "response".into(),
            Event::BodyData(_) => {
                let seq = self.data_seq(exchange_id, direction);
                format!("{direction}-data-{seq}")
            }
            Event::Error { .. } => format!("{direction}-error"),
        };
        format!("e{exchange_id}-{base}.json")
    }

    fn data_seq(&mut self, id: &reporting::Id, direction: &Direction) -> usize {
        *self
            .frame_counters
            .entry((*id, *direction))
            .and_modify(|e| *e += 1)
            .or_insert(1)
    }
}
