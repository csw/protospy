use std::net::SocketAddr;
use std::sync::Arc;

use clap::Parser;
use color_eyre::{Result, config::Frame};
use console_subscriber::ConsoleLayer;
use tracing::{info, level_filters::LevelFilter};
use tracing_error::ErrorLayer;
use tracing_subscriber::util::SubscriberInitExt;
use tracing_subscriber::{self, EnvFilter};
use tracing_subscriber::{prelude::*, registry::Registry};

use crate::proxy::client::Client;
use crate::server::App;

pub mod proxy;
pub mod server;
pub(crate) mod tokio_util;

#[derive(Parser, Debug)]
#[command(version, about, long_about = None)]
struct Args {
    /// Proxy definition
    #[arg(long = "proxy", required = true)]
    proxies: Vec<ProxyConfig>,
    #[arg(long)]
    console: bool,
}

#[derive(Debug, Clone)]
struct ProxyConfig {
    name: String,
    port: u16,
    target: String,
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
                    port = Some(v.parse::<u16>().map_err(|e| format!("invalid port: {e}"))?);
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
    let args = Args::parse();
    init_logging(args.console)?;

    let client = proxy::client::build();
    let proxy_group = Arc::new(create_group(&args, client)?);

    let app = Arc::new(App {
        proxy_group: Arc::clone(&proxy_group),
    });
    let router = crate::server::router::router(app);
    let listener = tokio::net::TcpListener::bind("0.0.0.0:3100").await.unwrap();
    tokio::spawn(async move { axum::serve(listener, router).await.unwrap() });

    let mut proxy_join_set = proxy_group.start_services()?;

    let join_res = proxy_join_set.join_next().await;
    join_res.unwrap()?
}

fn create_group(args: &Args, client: Client) -> Result<proxy::Group> {
    let mut group = proxy::Group::new(client);
    for config in &args.proxies {
        let addr = SocketAddr::from(([127, 0, 0, 1], config.port));
        group.add_service(&config.name, addr, &config.target)?;
    }
    Ok(group)
}

/// Set up event logging and error reporting.
fn init_logging(enable_console: bool) -> Result<()> {
    // set up standard logging
    let log_filter = EnvFilter::builder()
        .with_default_directive(LevelFilter::INFO.into())
        .from_env()?;
    let log_layer = tracing_subscriber::fmt::layer().with_filter(log_filter);
    let console_layer = enable_console.then(|| ConsoleLayer::builder().with_default_env().spawn());

    // register tracing layers for logging and errors with color-eyre
    Registry::default()
        .with(ErrorLayer::default())
        .with(log_layer)
        .with(console_layer)
        .init();

    if enable_console {
        info!("enabled tokio-console support");
    }

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
