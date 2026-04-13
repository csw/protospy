use std::error::Error;

use http::StatusCode;

use crate::proxy::errors;

// Helpers for examining Hyper's error information, which is not exposed very
// conveniently.
//
// N.B. I'm puzzled as to how to test this, since I can't construct a
// hyper_util::client::legacy::Error.

/// Indicate whether this is a Hyper 'user error', i.e. a bad request.
pub fn is_user_error(top: &hyper_util::client::legacy::Error) -> bool {
    find_in_err_chain(top, |err: &hyper::Error| err.is_user())
}

/// Return the appropriate internal error cause and response status for a hyper
/// error.
pub fn classify(client_error: &hyper_util::client::legacy::Error) -> (errors::Cause, StatusCode) {
    if client_error.is_connect() {
        (errors::Cause::ConnectFailed, StatusCode::BAD_GATEWAY)
    } else if is_user_error(client_error) {
        (errors::Cause::RequestError, StatusCode::BAD_REQUEST)
    } else {
        (errors::Cause::ConnectionError, StatusCode::BAD_GATEWAY)
    }
}

/// Generate a verbose representation for debugging.
pub fn report(top: &hyper::Error) -> String {
    let mut report = dump_hyper_error(top);
    let mut err: &dyn Error = top;
    while let Some(src) = err.source() {
        report += " <- ";
        let desc = if let Some(hyper_err) = src.downcast_ref::<hyper::Error>() {
            dump_hyper_error(hyper_err)
        } else {
            format!("{src:?}")
        };
        report += desc.as_str();
        err = src;
    }
    report
}

fn dump_hyper_error(err: &hyper::Error) -> String {
    format!(
        "[hyper::Error desc='{}' flags={}]",
        err,
        hyper_error_flags(err).join(",")
    )
}

fn hyper_error_flags(err: &hyper::Error) -> Vec<&'static str> {
    let mut flags = Vec::new();
    if err.is_parse() {
        flags.push("parse");
    }
    if err.is_parse_too_large() {
        flags.push("parse_too_large");
    }
    if err.is_parse_status() {
        flags.push("parse_status");
    }
    if err.is_user() {
        flags.push("is_user");
    }
    if err.is_canceled() {
        flags.push("canceled");
    }
    if err.is_closed() {
        flags.push("closed");
    }
    if err.is_incomplete_message() {
        flags.push("incomplete_message");
    }
    if err.is_body_write_aborted() {
        flags.push("body_write_aborted");
    }
    if err.is_shutdown() {
        flags.push("shutdown");
    }
    if err.is_timeout() {
        flags.push("timeout");
    }
    flags
}

fn find_in_err_chain<E: Error + 'static>(
    err: &(dyn Error + 'static),
    pred: fn(&E) -> bool,
) -> bool {
    let mut cur: &dyn Error = err;
    loop {
        if let Some(specific) = cur.downcast_ref::<E>()
            && pred(specific)
        {
            return true;
        }
        match cur.source() {
            Some(src) => {
                cur = src;
            }
            None => return false,
        }
    }
}
