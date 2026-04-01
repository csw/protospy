use std::net::SocketAddr;
use std::sync::Arc;

use color_eyre::{Result, eyre::WrapErr};
use http::uri;
use hyper::server::conn::http1;
use hyper::service::service_fn;
use hyper::{Request, Response};
use hyper_util::rt::TokioIo;
use tokio::net::TcpListener;
use tracing::Instrument;

use crate::server::conn::ConnInfo;

use super::client::Client;

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
        eprintln!("Listening on {}", self.addr);

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
    ) -> Result<Response<hyper::body::Incoming>> {
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
            super::headers::build(&self, &req, &conn, target_h)?;
        }

        let wrapped_body = super::body::BodyWrapper {
            base: req.into_body(),
        };

        let target_req = target_req_builder.body(wrapped_body)?;

        self.client
            .request(target_req)
            .await
            .wrap_err_with(move || format!("HTTP request to {} failed", target_uri))
    }
}
