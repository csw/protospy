use std::error::Error;
use std::fmt::Debug;
use std::net::SocketAddr;
use std::sync::{Arc, Mutex};

use color_eyre::{Result, eyre::WrapErr};
use http::{StatusCode, Uri, uri};
use hyper::server::conn::http1;
use hyper::service::service_fn;
use hyper::{Request, Response};
use hyper_util::rt::TokioIo;
use tokio::net::{TcpListener, TcpStream};
use tokio::task::JoinSet;
use tokio::time::Duration;
use tracing::{Instrument, debug, error, info, instrument};

use crate::proxy::{
    body::{self, ProxyResponse},
    hyper_errors,
    reporting::EventReporterService,
};
use crate::proxy::{conn::ConnInfo, exchange::Exchange};

use super::client::Client;
use super::errors;

pub const SERVER_NAME: &str = "protospy";

#[derive(Debug)]
pub struct Service {
    /// User-defined name of the server instance, e.g. 'db'.
    pub name: String,
    /// Listening socket address.
    pub addr: SocketAddr,
    /// Target URL.
    pub target: String,
    /// HTTP client.
    pub client: Client,
    /// Event reporter.
    pub reporter_service: Arc<dyn EventReporterService>,
    // /// JoinSet of tasks.
    pub tasks: Arc<Mutex<JoinSet<Result<()>>>>,
}

impl Service {
    pub fn new(
        name: String,
        addr: SocketAddr,
        target: String,
        client: Client,
        reporter_service: Arc<dyn EventReporterService>,
    ) -> Self {
        Self {
            name,
            addr,
            target,
            client,
            reporter_service,
            tasks: Arc::new(Mutex::new(JoinSet::new())),
        }
    }

    #[instrument(level = "info", skip(self), fields(name = %self.name, addr = %self.addr, target = %self.target))]
    pub async fn run(self: Arc<Self>) -> Result<()> {
        // We create a TcpListener and bind it
        let listener: TcpListener = TcpListener::bind(self.addr).await?;
        info!("Listening");

        let log_tasks = Arc::clone(&self.tasks);
        tokio::spawn(async move { log_joined(log_tasks).await });

        // We start a loop to continuously accept incoming connections
        loop {
            let (stream, _) = listener.accept().await?;
            self.handle_connection(stream)?;
        }
    }

    fn handle_connection(self: &Arc<Self>, stream: TcpStream) -> Result<()> {
        let conn_info = ConnInfo {
            protocol: "http".to_string(),
            client: stream.peer_addr()?,
        };

        // Use an adapter to access something implementing `tokio::io` traits as if they implement
        // `hyper::rt` IO traits.
        let io = TokioIo::new(stream);
        let server = Arc::clone(self);

        tokio::task::Builder::new()
            .name(format!("conn({}) {}", self.name, conn_info.client).as_str())
            .spawn(
                async move {
                    if let Err(err) = http1::Builder::new()
                        // `service_fn` converts our function in a `Service`
                        .serve_connection(
                            io,
                            service_fn(move |req| {
                                let server = Arc::clone(&server);
                                server.proxy(req, conn_info.clone())
                            }),
                        )
                        .await
                    {
                        error!("error serving connection: {:?}", err);
                    }
                }
                .instrument(tracing::Span::current()),
            )?;
        Ok(())
    }

    /// Proxy a single request to the upstream server.
    #[instrument(skip(self))]
    async fn proxy(
        self: Arc<Self>,
        client_request: Request<hyper::body::Incoming>,
        conn: ConnInfo,
    ) -> Result<ProxyResponse> {
        let client_request = body::map_request_body(client_request, body::wrapped);

        let mut exchange = Exchange::new(Arc::clone(&self), self.should_report(), conn);
        exchange.process(client_request).await
    }

    /// Map the original request URI to the upstream server.
    pub fn map_uri(&self, req_uri: &Uri) -> Result<Uri> {
        Ok(uri::Builder::new()
            .scheme(http::uri::Scheme::HTTP)
            .authority(self.target.as_str())
            .path_and_query(
                req_uri
                    .path_and_query()
                    .map_or("/", http::uri::PathAndQuery::as_str),
            )
            .build()?)
    }

    /// Determine whether to capture this exchange.
    ///
    /// If there are no listeners, don't bother.
    fn should_report(&self) -> bool {
        self.reporter_service.should_report()
    }
}

pub fn client_error_response(
    client_error: &hyper_util::client::legacy::Error,
) -> Result<ProxyResponse> {
    let (cause_tag, status) = hyper_errors::classify(client_error);
    if let Some(source) = client_error.source()
        && let Some(hyper_err) = source.downcast_ref::<hyper::Error>()
    {
        error!(
            "hyper error: {:?}, source {:?}",
            hyper_err,
            hyper_err.source(),
        );
        error!("hyper error report: {}", hyper_errors::report(hyper_err));
    }
    error!(
        name = "upstream_connection_error",
        cause = cause_tag.to_string(),
        status = status.as_u16(),
        error = ?client_error,
    );
    error_http_response(status, cause_tag)
}

pub fn internal_error_response(err: eyre::Report) -> Result<ProxyResponse> {
    error!(
        name = "internal_error",
        error = ?err,
    );
    error_http_response(StatusCode::BAD_GATEWAY, errors::Cause::InternalError)
}

pub fn error_http_response(status: StatusCode, cause: errors::Cause) -> Result<ProxyResponse> {
    Response::builder()
        .status(status)
        .header("server", SERVER_NAME)
        .header("x-cause", cause.to_string())
        .body(body::downstream::empty_response())
        .wrap_err("failed to build internal response")
}

async fn log_joined<T>(tasks: Arc<Mutex<JoinSet<Result<T>>>>)
where
    T: Debug + 'static,
{
    let mut ticker = tokio::time::interval(Duration::from_millis(100));
    loop {
        ticker.tick().await;
        {
            let mut tasks = tasks.lock().unwrap();
            while let Some(res) = tasks.try_join_next() {
                debug!(event = "task_exited", res = ?res);
            }
        }
    }
}
