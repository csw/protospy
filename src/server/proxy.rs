use std::error::Error;
use std::net::SocketAddr;
use std::sync::Arc;

use color_eyre::{
    Result,
    eyre::{WrapErr, eyre},
};
use http::{StatusCode, Uri, uri};
use hyper::body::Incoming;
use hyper::server::conn::http1;
use hyper::service::service_fn;
use hyper::{Request, Response};
use hyper_util::rt::TokioIo;
use tokio::net::{TcpListener, TcpStream};
use tracing::{Instrument, debug, error, info, instrument};

use crate::server::{
    body::ProxyResponse,
    monitor::Publisher,
    op::{self, OpReportingContext},
};
use crate::server::{conn::ConnInfo, monitor};

use super::body;
use super::client::Client;
use super::errors;
use super::headers;

pub const SERVER_NAME: &str = "protospy";

#[derive(Debug)]
pub struct Server {
    /// User-defined name of the server instance, e.g. 'db'.
    pub name: String,
    /// Listening socket address.
    pub addr: SocketAddr,
    /// Target URL.
    pub target: String,
    /// HTTP client.
    pub client: Client,
    /// Tracking sender.
    pub publisher: monitor::Publisher,
    pub subscriber: monitor::Receiver,
}

impl Server {
    pub fn new(name: String, addr: SocketAddr, target: String, client: Client) -> Self {
        let publisher = Publisher::new();
        let subscriber = publisher.subscribe();
        Self {
            name,
            addr,
            target,
            client,
            publisher,
            subscriber,
        }
    }

    #[instrument(level = "info", skip(self), fields(name = %self.name, addr = %self.addr, target = %self.target))]
    pub async fn run(self: Arc<Self>) -> Result<()> {
        // We create a TcpListener and bind it
        let listener: TcpListener = TcpListener::bind(self.addr).await?;
        info!("Listening");

        monitor::start_logger(&self.name, self.publisher.subscribe())?;

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
        req: Request<hyper::body::Incoming>,
        conn: ConnInfo,
    ) -> Result<ProxyResponse> {
        let req_uri = req.uri();

        let target_uri = self.map_uri(req_uri)?;
        let req_headers = headers::request_headers(self.target.as_str(), &req, &conn)?;

        let (req_parts, req_body) = req.into_parts();

        let mut target_req_builder = Request::builder()
            .method(&req_parts.method)
            .uri(target_uri.clone());
        *target_req_builder
            .headers_mut()
            .ok_or_else(|| eyre!("invalid request builder state for headers"))? = req_headers;

        let mut reporting_ctx = self.prepare_reporting(req_parts, conn)?;

        let target_request = target_req_builder.body(req_body)?;
        let result = reporting_ctx
            .forward_request(&self.client, target_request)?
            .await;

        let our_response = match result {
            Ok(upstream_response) => {
                let proxied = build_response(upstream_response)?;
                reporting_ctx.tracked_response(proxied)?
            }
            Err(upstream_err) => return error_response(&upstream_err),
        };
        Ok(our_response)
    }

    fn map_uri(&self, req_uri: &Uri) -> Result<Uri> {
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

    fn prepare_reporting(
        &self,
        request: http::request::Parts,
        conn_info: ConnInfo,
    ) -> Result<OpReportingContext> {
        if self.publisher.has_listeners() {
            let (op_reporter, reporting_ctx) =
                op::create_reporting(self.publisher.sender(), request, conn_info);
            op_reporter.start()?;
            Ok(reporting_ctx)
        } else {
            Ok(OpReportingContext::create_noop())
        }
    }
}

fn build_response(response: Response<Incoming>) -> Result<Response<Incoming>> {
    // N.B. I'm puzzled as to how to test this, since I can't construct a
    // hyper_util::client::legacy::Error.

    debug!(
        name = "upstream_response",
        status = response.status().to_string()
    );

    let new_headers = headers::response_headers(&response)?;
    let (mut parts, body) = response.into_parts();

    parts.headers = new_headers;

    Ok(Response::from_parts(parts, body))
}

fn error_response(client_error: &hyper_util::client::legacy::Error) -> Result<ProxyResponse> {
    let (cause_tag, status) = classify_error(client_error);
    if let Some(source) = client_error.source()
        && let Some(hyper_err) = source.downcast_ref::<hyper::Error>()
    {
        error!(
            "hyper error: {:?}, source {:?}",
            hyper_err,
            hyper_err.source(),
        );
        error!("hyper error report: {}", hyper_error_report(hyper_err));
    }
    error!(
        name = "upstream_connection_error",
        cause = cause_tag.to_string(),
        status = status.as_u16(),
        error = ?client_error,
    );
    error_http_response(status, cause_tag)
}

fn error_http_response(status: StatusCode, cause: errors::Cause) -> Result<ProxyResponse> {
    Response::builder()
        .status(status)
        .header("server", SERVER_NAME)
        .header("x-cause", cause.to_string())
        .body(body::empty_response_body())
        .wrap_err("failed to build internal response")
}

fn classify_error(client_error: &hyper_util::client::legacy::Error) -> (errors::Cause, StatusCode) {
    if client_error.is_connect() {
        (errors::Cause::ConnectFailed, StatusCode::BAD_GATEWAY)
    } else if is_hyper_user_error(client_error) {
        (errors::Cause::RequestError, StatusCode::BAD_REQUEST)
    } else {
        (errors::Cause::ConnectionError, StatusCode::BAD_GATEWAY)
    }
}

fn hyper_error_report(top: &hyper::Error) -> String {
    let mut report = dump_hyper_error(top);
    let mut err: &dyn Error = top;
    while let Some(src) = err.source() {
        report += " <- ";
        let desc = if let Some(hyper_err) = src.downcast_ref::<hyper::Error>() {
            dump_hyper_error(hyper_err)
        } else {
            format!("{:?}", src)
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

fn is_hyper_user_error(top: &hyper_util::client::legacy::Error) -> bool {
    find_in_err_chain(top, |err: &hyper::Error| err.is_user())
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
