use std::error::Error;
use std::net::SocketAddr;
use std::sync::Arc;

use chrono::{TimeDelta, prelude::*};
use color_eyre::{
    Result,
    eyre::{WrapErr, eyre},
};
use futures::StreamExt;
use http::{StatusCode, Uri, uri};
use hyper::body::Body;
use hyper::server::conn::http1;
use hyper::service::service_fn;
use hyper::{Request, Response};
use hyper_util::rt::TokioIo;
use tokio::net::{TcpListener, TcpStream};
use tracing::{Instrument, debug, error, info, instrument};

use crate::proxy::conn::ConnInfo;
use crate::proxy::{
    body::{self, PrefetchedBody, ProxyResponse},
    errors::BodyError,
    event::Event,
    exchange::{self, EventReporter, EventReporterService, Exchange},
    hyper_errors,
};

use super::client::Client;
use super::errors;
use super::headers;

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
        }
    }

    #[instrument(level = "info", skip(self), fields(name = %self.name, addr = %self.addr, target = %self.target))]
    pub async fn run(self: Arc<Self>) -> Result<()> {
        // We create a TcpListener and bind it
        let listener: TcpListener = TcpListener::bind(self.addr).await?;
        info!("Listening");

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
        let exchange = self.should_report().then(Exchange::default);

        let client_request = body::map_request_body(client_request, body::wrapped);

        let upstream_request = match self.process_request(&exchange, client_request, conn).await {
            Ok(request) => request,
            Err(err) => {
                return internal_error_response(err.wrap_err("failed to build upstream request"));
            }
        };

        let sent_at = Utc::now();

        // send the request to the upstream server
        let upstream_response = match self.client.request(upstream_request).await {
            Ok(response) => body::map_response_body(response, body::wrapped),
            Err(upstream_err) => return client_error_response(&upstream_err),
        };
        let elapsed = Utc::now() - sent_at;

        // handle the response
        match self
            .process_response(&exchange, upstream_response, elapsed)
            .await
        {
            Ok(response) => Ok(response),
            Err(err) => {
                internal_error_response(err.wrap_err("failed to build downstream response"))
            }
        }
    }

    async fn process_request(
        &self,
        exchange: &Option<Exchange>,
        client_request: Request<body::Internal>,
        conn: ConnInfo,
    ) -> Result<Request<body::upstream::RequestBody>> {
        let (client_request, orig_req_parts) = clone_request_parts(client_request);

        // transform the request for upstream
        let proxy_request = self.proxy_request(client_request, conn)?;
        // set up for reporting, if needed
        if let Some(exchange) = exchange {
            let reporter = self.reporter_service.make_reporter(*exchange);
            Self::track_request(reporter, proxy_request, orig_req_parts).await
        } else {
            Ok(body::map_request_body(proxy_request, body::wrapped))
        }
    }

    /// Transform an incoming client request into the appropriate upstream request.
    fn proxy_request(
        &self,
        request: Request<body::Internal>,
        conn: ConnInfo,
    ) -> Result<Request<body::Internal>> {
        let req_uri = request.uri();

        let target_uri = self.map_uri(req_uri)?;
        let req_headers = headers::request_headers(self.target.as_str(), &request, &conn)?;
        let (req_parts, req_body) = request.into_parts();

        let mut target_req_builder = Request::builder()
            .method(&req_parts.method)
            .uri(target_uri.clone());
        *target_req_builder
            .headers_mut()
            .ok_or_else(|| eyre!("invalid request builder state for headers"))? = req_headers;
        Ok(target_req_builder.body(req_body)?)
    }

    async fn track_request(
        reporter: Box<dyn EventReporter>,
        request: Request<body::Internal>,
        orig_parts: http::request::Parts,
    ) -> Result<Request<body::upstream::RequestBody>> {
        let (parts, orig_body) = request.into_parts();
        let (found_body_data, prefetched) = body::collect_ready_data(orig_body).await?;

        let event = Event::from_request(orig_parts, found_body_data);
        reporter.send_event(event)?;

        let upstream_body =
            Self::assemble_tracked_body(prefetched, reporter, body::Direction::Request).await;

        Ok(Request::from_parts(parts, upstream_body))
    }

    /// Process the response, transforming headers, reporting if appropriate,
    /// and handling the body.
    async fn process_response(
        &self,
        exchange: &Option<Exchange>,
        response: Response<body::Internal>,
        elapsed: TimeDelta,
    ) -> Result<ProxyResponse> {
        // report if appropriate
        if let Some(exchange) = exchange {
            let (response, orig_parts) = clone_response_parts(response);

            let response = self.proxy_response(response)?;
            let reporter = self.reporter_service.make_reporter(*exchange);
            Ok(Self::track_response(reporter, response, orig_parts, elapsed).await?)
        } else {
            Ok(body::map_response_body(
                self.proxy_response(response)?,
                body::wrapped,
            ))
        }
    }

    fn proxy_response(
        &self,
        response: Response<body::Internal>,
    ) -> Result<Response<body::Internal>> {
        // generate appropriate headers for our response
        let new_headers = headers::response_headers(&response)?;

        let (mut parts, body) = response.into_parts();

        // set the headers
        parts.headers = new_headers;

        Ok(Response::from_parts(parts, body))
    }

    async fn track_response(
        reporter: Box<dyn EventReporter>,
        response: Response<body::Internal>,
        orig_parts: http::response::Parts,
        elapsed: TimeDelta,
    ) -> Result<Response<body::Internal>> {
        let (parts, orig_body) = response.into_parts();
        let (found_body_data, prefetched) = body::collect_ready_data(orig_body).await?;
        debug!("track_response found: {:?}", found_body_data);

        let event = Event::from_response(orig_parts, found_body_data, elapsed);
        reporter.send_event(event)?;

        let downstream_body =
            Self::assemble_tracked_body(prefetched, reporter, body::Direction::Response).await;

        Ok(Response::from_parts(parts, downstream_body))
    }

    async fn assemble_tracked_body<B>(
        prefetched: PrefetchedBody<B>,
        reporter: Box<dyn EventReporter>,
        direction: body::Direction,
    ) -> body::Internal
    where
        B: Body<Data = body::Data, Error = BodyError> + Unpin + Send + Sync + 'static,
    {
        let read_bytes: usize = prefetched
            .frames
            .as_ref()
            .map(|frames| {
                frames
                    .iter()
                    .filter_map(|f| f.data_ref().map(|d| d.len()))
                    .sum()
            })
            .unwrap_or_default();

        let tracked = |rest| exchange::tracked_body_stream(reporter, direction, rest, read_bytes);

        match prefetched {
            PrefetchedBody {
                frames: Some(frames),
                rest: Some(rest),
            } => body::wrapped_stream(body::frame_stream(frames).chain(tracked(rest))),
            PrefetchedBody {
                frames: Some(frames),
                rest: None,
            } => body::wrapped_stream(body::frame_stream(frames)),
            PrefetchedBody {
                frames: None,
                rest: Some(rest),
            } => body::wrapped_stream(tracked(rest)),
            PrefetchedBody {
                frames: None,
                rest: None,
            } => body::wrapped(http_body_util::Empty::new()),
        }
    }

    /// Map the original request URI to the upstream server.
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

    /// Determine whether to capture this exchange.
    ///
    /// If there are no listeners, don't bother.
    fn should_report(&self) -> bool {
        self.reporter_service.should_report()
    }
}

fn clone_request_parts<B>(request: http::Request<B>) -> (http::Request<B>, http::request::Parts) {
    let (parts, body) = request.into_parts();
    let cloned = parts.clone();
    (Request::from_parts(parts, body), cloned)
}

fn clone_response_parts<B>(
    response: http::Response<B>,
) -> (http::Response<B>, http::response::Parts) {
    let (parts, body) = response.into_parts();
    let cloned = parts.clone();
    (Response::from_parts(parts, body), cloned)
}

fn client_error_response(
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

fn internal_error_response(err: eyre::Report) -> Result<ProxyResponse> {
    error!(
        name = "internal_error",
        error = ?err,
    );
    error_http_response(StatusCode::BAD_GATEWAY, errors::Cause::InternalError)
}

fn error_http_response(status: StatusCode, cause: errors::Cause) -> Result<ProxyResponse> {
    Response::builder()
        .status(status)
        .header("server", SERVER_NAME)
        .header("x-cause", cause.to_string())
        .body(body::downstream::empty_response())
        .wrap_err("failed to build internal response")
}
