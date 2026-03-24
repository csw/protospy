use std::{net::SocketAddr, sync::Arc};

use clap::Parser;

pub mod server;

#[derive(Parser, Debug)]
#[command(version, about, long_about = None)]
struct Args {
    /// Target server
    #[arg(short, long)]
    target: String,

    /// Port to listen on
    #[arg(short, long, default_value_t = 3000)]
    port: u16,
}

#[tokio::main]
pub async fn main() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let args = Args::parse();
    let addr = SocketAddr::from(([127, 0, 0, 1], args.port));
    let server = server::Server { addr };
    let server_rc = Arc::new(server);
    let res = server_rc.run().await;
    Ok(res.map_err(Box::new)?)
}
