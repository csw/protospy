use std::net::SocketAddr;
use std::sync::Arc;

use color_eyre::{Result, eyre::WrapErr};
use http::{StatusCode, uri};
use http_body_util::{Either, Empty};
use hyper::body::Bytes;
use hyper::server::conn::http1;
use hyper::service::service_fn;
use hyper::{Request, Response};
use hyper_util::rt::TokioIo;
use tokio::net::TcpListener;
use tracing::{Instrument, error, info};

use crate::server::conn::ConnInfo;

use super::client::Client;
use super::errors;
use super::headers;

pub const SERVER_NAME: &str = "protospy";

type ProxyResponse =
    Response<http_body_util::Either<hyper::body::Incoming, http_body_util::Empty<Bytes>>>;

type ClientResult = <hyper_util::client::legacy::ResponseFuture as Future>::Output;

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
                        eprintln!("Error serving connection: {:?}", err);
                    }
                }
                .instrument(tracing::Span::current()),
            );
        }
    }

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

        let wrapped_body = super::body::BodyWrapper {
            base: req.into_body(),
        };

        let target_req = target_req_builder.body(wrapped_body)?;

        info!("Forwarding request");

        let response_res = self.client.request(target_req).await;

        self.build_response(response_res)
    }

    fn build_response(&self, upstream: ClientResult) -> Result<ProxyResponse> {
        // N.B. I'm puzzled as to how to test this, since I can't construct a
        // hyper_util::client::legacy::Error.

        let response = match upstream {
            Ok(response) => response,
            Err(e) => {
                return self.error_response(e);
            }
        };

        info!(
            name = "upstream_response",
            status = response.status().to_string()
        );

        let new_headers = headers::response_headers(&response)?;
        let (mut parts, body) = response.into_parts();

        parts.headers = new_headers;
        Ok(Response::from_parts(parts, Either::Left(body)))
    }

    fn error_response(
        &self,
        client_error: hyper_util::client::legacy::Error,
    ) -> Result<ProxyResponse> {
        let cause = if client_error.is_connect() {
            errors::Cause::ConnectFailed
        } else {
            errors::Cause::ConnectionError
        };
        error!(
            name = "upstream_connection_error",
            cause = cause.to_string(),
            error = ?client_error,
        );
        self.error_http_response(StatusCode::BAD_GATEWAY, cause)
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
