use std::{net::SocketAddr, sync::Arc};

use clap::Parser;
use color_eyre::config::Frame;
use eyre::Result;
use tokio::task::JoinSet;
use tracing::level_filters::LevelFilter;
use tracing_error::ErrorLayer;
use tracing_subscriber::{self, EnvFilter};
use tracing_subscriber::{prelude::*, registry::Registry};

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
    fn to_server(&self, client: server::client::Client) -> server::Server {
        server::Server {
            addr: SocketAddr::from(([127, 0, 0, 1], self.port)),
            target: self.target.clone(),
            client,
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
pub async fn main() -> Result<()> {
    // init_logging();
    init_logging()?;

    let args = Args::parse();
    let client = server::client::build();
    let servers: Vec<Arc<server::Server>> = args
        .proxies
        .iter()
        .map(|p| {
            _ = p.name;
            Arc::new(p.to_server(client.clone()))
        })
        .collect();
    let mut join_set = JoinSet::new();
    for server in servers.iter() {
        let server = Arc::clone(server);
        _ = join_set.spawn(async move { server.run().await });
    }
    join_set.join_next().await.unwrap().unwrap()
}

/// Set up event logging and error reporting.
fn init_logging() -> Result<()> {
    // set up standard logging
    let log_filter = EnvFilter::builder()
        .with_default_directive(LevelFilter::INFO.into())
        .from_env()?;
    let log_layer = tracing_subscriber::fmt::layer().with_filter(log_filter);

    // register tracing layers for logging and errors with color-eyre
    Registry::default()
        .with(ErrorLayer::default())
        .with(log_layer)
        .init();

    // filter backtrace frames for only ours; otherwise we get about 50
    // infrastructure frames.
    color_eyre::config::HookBuilder::default()
        .add_frame_filter(Box::new(&our_frames_filter))
        .install()
}

fn our_frames_filter(frames: &mut Vec<&Frame>) {
    frames.retain(|frame| {
        frame
            .name
            .as_ref()
            .is_some_and(|name| name.starts_with("protospy::"))
    });
}
