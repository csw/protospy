use std::time::Duration;

use http_body_util::Either;
use hyper_util::rt::{TokioExecutor, TokioTimer};

use super::body::BodyWrapper;

// type HyperClient = hyper_util::client::legacy::Client;

pub type Client = hyper_util::client::legacy::Client<
    hyper_util::client::legacy::connect::HttpConnector,
    ClientBody,
>;

pub type ClientBody = Either<hyper::body::Incoming, BodyWrapper>;

pub fn build() -> Client {
    hyper_util::client::legacy::Client::builder(TokioExecutor::new())
        .pool_timer(TokioTimer::new())
        .pool_idle_timeout(Duration::from_secs(30))
        .build_http::<ClientBody>()
}
