use std::sync::Arc;

use color_eyre::Result;
use tokio::sync::broadcast;

use crate::server::op::Op;

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
