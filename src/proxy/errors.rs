use strum::Display;

#[derive(Clone, Copy, Display)]
pub enum Cause {
    ConnectFailed,
    ConnectionError,
    RequestError,
    InternalError,
}

use thiserror::Error;

#[derive(Error, Debug)]
pub enum BodyError {
    #[error("hyper I/O error")]
    Read(#[from] hyper::Error),
    #[error("eyre")]
    Report(#[from] color_eyre::Report),
    #[error("impossible")]
    Impossible(#[from] std::convert::Infallible),
    #[cfg(test)]
    #[error("test")]
    Test,
}
