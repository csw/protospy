use std::{net::SocketAddr, sync::Arc};

use clap::Parser;
use tokio::task::JoinSet;

pub mod server;

#[derive(Parser, Debug)]
#[command(version, about, long_about = None)]
struct Args {
    /// Proxy definition
    #[arg(long = "proxy")]
    proxies: Vec<ProxyConfig>,
}

#[derive(Debug, Clone)]
struct ProxyConfig {
    name: String,
    port: u16,
    target: String,
}

impl ProxyConfig {
    fn to_server(&self) -> server::Server {
        server::Server {
            addr: SocketAddr::from(([127, 0, 0, 1], self.port)),
            target: self.target.clone(),
        }
    }
}

impl std::str::FromStr for ProxyConfig {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        let mut name = None;
        let mut port = None;
        let mut target = None;

        for pair in s.split(',') {
            match pair.split_once('=') {
                Some(("name", v)) => name = Some(v.to_string()),
                Some(("port", v)) => {
                    port = Some(v.parse::<u16>().map_err(|e| format!("invalid port: {e}"))?)
                }
                Some(("target", v)) => target = Some(v.to_string()),
                Some((field, _)) => return Err(format!("unknown field: {field}")),
                None => return Err(format!("invalid option: {pair}")),
            }
        }

        Ok(ProxyConfig {
            name: name.ok_or("missing name")?,
            port: port.ok_or("missing port")?,
            target: target.ok_or("missing target")?,
        })
    }
}

#[tokio::main]
pub async fn main() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let args = Args::parse();
    let servers: Vec<Arc<server::Server>> = args
        .proxies
        .iter()
        .map(|p| {
            _ = p.name;
            Arc::new(p.to_server())
        })
        .collect();
    let mut join_set = JoinSet::new();
    for server in servers.iter() {
        let server = Arc::clone(server);
        _ = join_set.spawn(async move { server.run().await });
    }
    Ok(join_set
        .join_next()
        .await
        .unwrap()
        .unwrap()
        .map(|_| ())
        .map_err(Box::new)?)
}
