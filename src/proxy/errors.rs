use std::error::Error;

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

pub fn find_in_eyre_chain<E: Error + 'static>(report: &color_eyre::Report) -> Option<&E> {
    report.chain().find_map(move |err| err.downcast_ref::<E>())
}

pub fn find_in_err_chain<'a, E: Error + 'static>(
    err: &'a (dyn Error + 'static),
    pred: impl Fn(&E) -> bool,
) -> Option<&'a E> {
    let mut cur: &dyn Error = err;
    loop {
        if let Some(specific) = cur.downcast_ref::<E>()
            && pred(specific)
        {
            return Some(specific);
        }
        match cur.source() {
            Some(src) => {
                cur = src;
            }
            None => return None,
        }
    }
}
