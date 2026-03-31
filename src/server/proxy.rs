use std::io;
use std::net::SocketAddr;
use std::sync::Arc;

use hyper::server::conn::http1;
use hyper::service::service_fn;
use hyper::{Request, Response};
use hyper_util::rt::TokioIo;
use tokio::net::{TcpListener, TcpStream};

use crate::server::conn::ConnInfo;

pub struct Server {
    pub addr: SocketAddr,
    pub target: String,
}

impl Server {
    pub async fn run(self: Arc<Self>) -> io::Result<()> {
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
            tokio::task::spawn(async move {
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
            });
        }
    }

    async fn proxy(
        self: Arc<Self>,
        req: Request<hyper::body::Incoming>,
        conn: ConnInfo,
    ) -> Result<Response<hyper::body::Incoming>, Box<dyn std::error::Error + Send + Sync>> {
        let uri_string = req
            .uri()
            .path_and_query()
            .map(|x| x.as_str())
            .unwrap_or("/");

        let mut target_req_builder = Request::builder().method(req.method()).uri(uri_string);
        if let Some(target_h) = target_req_builder.headers_mut() {
            super::headers::build(&self, &req, &conn, target_h)?;
        }

        let wrapped_body = super::body::BodyWrapper {
            base: req.into_body(),
        };

        let target_req = target_req_builder.body(wrapped_body)?;

        let client_stream = TcpStream::connect(&self.target).await.unwrap();
        let io = TokioIo::new(client_stream);

        let (mut sender, conn) = hyper::client::conn::http1::handshake(io).await?;
        tokio::task::spawn(async move {
            if let Err(err) = conn.await {
                eprintln!("Connection failed: {:?}", err);
            }
        });

        // Await the response...
        Ok(sender.send_request(target_req).await.map_err(Box::new)?)
    }
}
