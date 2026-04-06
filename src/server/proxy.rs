use std::error::Error;
use std::net::SocketAddr;
use std::sync::Arc;

use color_eyre::{
    Result,
    eyre::{WrapErr, eyre},
};
use http::{StatusCode, uri};
use http_body_util::{Either, Empty};
use hyper::body::{Bytes, Incoming};
use hyper::server::conn::http1;
use hyper::service::service_fn;
use hyper::{Request, Response};
use hyper_util::rt::TokioIo;
use tokio::net::TcpListener;
use tracing::{Instrument, error, info};

use crate::server::conn::ConnInfo;
use crate::server::op::{self, OpReportingContext};

use super::body::BodyWrapper;
use super::client::Client;
use super::errors;
use super::headers;

pub const SERVER_NAME: &str = "protospy";

type ProxyResponse = Response<http_body_util::Either<BodyWrapper, http_body_util::Empty<Bytes>>>;

#[derive(Debug)]
pub struct Server {
    pub addr: SocketAddr,
    pub target: String,
    pub client: Client,
}

impl Server {
    #[tracing::instrument(level = "info")]
    pub async fn run(self: Arc<Self>) -> Result<()> {
        // We create a TcpListener and bind it
        let listener: TcpListener = TcpListener::bind(self.addr).await?;
        info!("Listening");

        // We start a loop to continuously accept incoming connections
        loop {
            let (stream, _) = listener.accept().await?;

            let conn_info = ConnInfo {
                protocol: "http".to_string(),
                client: stream.peer_addr()?,
            };

            // Use an adapter to access something implementing `tokio::io` traits as if they implement
            // `hyper::rt` IO traits.
            let io = TokioIo::new(stream);
            let server = Arc::clone(&self);

            // Spawn a tokio task to serve multiple connections concurrently
            tokio::task::spawn(
                async move {
                    // Finally, we bind the incoming connection to our `hello` service
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
            );
        }
    }

    /// Proxy a single request to the upstream server.
    #[tracing::instrument]
    async fn proxy(
        self: Arc<Self>,
        req: Request<hyper::body::Incoming>,
        conn: ConnInfo,
    ) -> Result<ProxyResponse> {
        let req_uri = req.uri();

        let target_uri = uri::Builder::new()
            .scheme(http::uri::Scheme::HTTP)
            .authority(self.target.as_str())
            .path_and_query(
                req_uri
                    .path_and_query()
                    .map_or("/", http::uri::PathAndQuery::as_str),
            )
            .build()?;

        let mut target_req_builder = Request::builder()
            .method(req.method())
            .uri(target_uri.clone());
        if let Some(target_h) = target_req_builder.headers_mut() {
            headers::build_request(&self, &req, &conn, target_h)?;
        }

        let (req_parts, req_body) = req.into_parts();

        let (
            op_reporter,
            OpReportingContext {
                request_tracker,
                response_tracker,
                response_sender,
            },
        ) = op::create_reporting(req_parts, conn);

        tokio::spawn(
            async move {
                op_reporter.run().await?;
                Ok::<_, eyre::Report>(())
            }
            .instrument(tracing::Span::current()),
        );

        let wrapped_body = BodyWrapper::new(req_body, request_tracker);

        let target_req = target_req_builder.body(wrapped_body)?;

        info!("Forwarding request");

        let result = self.client.request(target_req).await;

        let our_response = match result {
            Ok(upstream_response) => {
                self.build_response(upstream_response, response_sender, response_tracker)?
            }
            Err(upstream_err) => return self.error_response(&upstream_err),
        };
        info!("Generated response");
        Ok(our_response)
    }

    fn build_response(
        &self,
        response: Response<Incoming>,
        response_sender: tokio::sync::oneshot::Sender<http::response::Parts>,
        response_tracker: op::BodyTracker,
    ) -> Result<ProxyResponse> {
        // N.B. I'm puzzled as to how to test this, since I can't construct a
        // hyper_util::client::legacy::Error.

        info!(
            name = "upstream_response",
            status = response.status().to_string()
        );

        let new_headers = headers::response_headers(&response)?;
        let (mut parts, body) = response.into_parts();
        response_sender
            .send(parts.clone())
            .map_err(|_| eyre!("failed to send response data"))?;

        parts.headers = new_headers;

        let wrapped_body = BodyWrapper::new(body, response_tracker);

        Ok(Response::from_parts(parts, Either::Left(wrapped_body)))
    }

    fn error_response(
        &self,
        client_error: &hyper_util::client::legacy::Error,
    ) -> Result<ProxyResponse> {
        let (cause_tag, status) = classify_error(client_error);
        if let Some(source) = client_error.source()
            && let Some(hyper_err) = source.downcast_ref::<hyper::Error>()
        {
            error!(
                "hyper error: {:?}, source {:?}",
                hyper_err,
                hyper_err.source(),
            );
            error!("hyper error report: {}", hyper_error_report(hyper_err))
        }
        error!(
            name = "upstream_connection_error",
            cause = cause_tag.to_string(),
            status = status.as_u16(),
            error = ?client_error,
        );
        self.error_http_response(status, cause_tag)
    }

    fn error_http_response(
        &self,
        status: StatusCode,
        cause: errors::Cause,
    ) -> Result<ProxyResponse> {
        Response::builder()
            .status(status)
            .header("server", SERVER_NAME)
            .header("x-cause", cause.to_string())
            .body(Either::Right(Empty::new()))
            .wrap_err("failed to build internal response")
    }
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
        flags.push("canceled")
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
