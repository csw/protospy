use std::sync::Arc;

use color_eyre::Result;
use tokio::sync::broadcast;

use crate::proxy::op::{self, Op};
use crate::tokio_util::spawn_instrumented;

pub type Payload = Arc<Op>;
pub type Sender = broadcast::Sender<Payload>;
pub type Receiver = broadcast::Receiver<Payload>;

const BUFSIZE: usize = 256;

#[derive(Debug)]
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

pub fn start_logger(
    server_name: &str,
    receiver: Receiver,
) -> Result<tokio::task::JoinHandle<Result<()>>> {
    let task_name = format!("logger({})", server_name);
    spawn_instrumented(
        task_name.as_str(),
        async move { run_logger(receiver).await },
    )
}

#[tracing::instrument(level = "info", skip(receiver))]
pub async fn run_logger(mut receiver: Receiver) -> Result<()> {
    loop {
        let val = receiver.recv().await?;
        op::log_op(&val)?;
    }
}
