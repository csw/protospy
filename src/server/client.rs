use std::time::Duration;

use hyper_util::rt::{TokioExecutor, TokioTimer};

use super::body::BodyWrapper;

// type HyperClient = hyper_util::client::legacy::Client;

pub type Client = hyper_util::client::legacy::Client<
    hyper_util::client::legacy::connect::HttpConnector,
    BodyWrapper,
>;

pub fn build() -> Client {
    hyper_util::client::legacy::Client::builder(TokioExecutor::new())
        .pool_timer(TokioTimer::new())
        .pool_idle_timeout(Duration::from_secs(30))
        .build_http::<BodyWrapper>()
}
