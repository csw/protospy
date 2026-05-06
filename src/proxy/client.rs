use std::time::Duration;

use hyper_rustls::{ConfigBuilderExt, HttpsConnector};
use hyper_util::{
    client::legacy::connect::HttpConnector,
    rt::{TokioExecutor, TokioTimer},
};

use super::body;

pub type Client = hyper_util::client::legacy::Client<
    hyper_rustls::HttpsConnector<hyper_util::client::legacy::connect::HttpConnector>,
    ClientBody,
>;

pub type ClientBody = body::upstream::RequestBody;

pub fn tls_conn() -> HttpsConnector<HttpConnector> {
    let _ = rustls::crypto::ring::default_provider().install_default();

    let tls = rustls::ClientConfig::builder()
        .with_webpki_roots()
        .with_no_client_auth();

    hyper_rustls::HttpsConnectorBuilder::new()
        .with_tls_config(tls)
        .https_or_http()
        .enable_http1()
        .build()
}

pub fn build_tls() -> Client {
    hyper_util::client::legacy::Client::builder(TokioExecutor::new())
        .pool_timer(TokioTimer::new())
        .pool_idle_timeout(Duration::from_secs(30))
        .build(tls_conn())
}

pub fn build() -> Client {
    build_tls()
}
