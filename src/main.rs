use std::fs;
use std::net::SocketAddr;
use std::path::Path;
use std::sync::Arc;

use chrono::prelude::*;
use color_eyre::Result;
use eyre::eyre;
use tokio::task::{JoinHandle, JoinSet};
use tracing::{debug, info};

use crate::config::Config;
use crate::proxy::client::Client;
use crate::proxy::group::ServiceEntry;
use crate::proxy::monitor;
use crate::server::App;
use crate::tokio_util::spawn_instrumented_on;

mod config;
mod logging;
pub mod proxy;
pub mod server;
pub(crate) mod tokio_util;

#[tokio::main]
pub async fn main() -> Result<()> {
    let config = Config::from_env()?;

    logging::init(config.tokio_console)?;

    if config.proxy.is_empty() {
        return Err(eyre!("no proxies configured"));
    }

    if let Some(out_dir) = &config.record_examples {
        fs::create_dir_all(out_dir)?;
    }

    let client = proxy::client::build();
    let proxy_group = Arc::new(create_group(&config, client)?);

    if config.web {
        start_web(
            SocketAddr::new(config.listen_addr, config.listen_port),
            Arc::clone(&proxy_group),
        )
        .await?;
    }

    let mut proxy_join_set = proxy_group.start_services()?;

    for service_entry in &proxy_group.services {
        if config.print_messages {
            start_event_printer(&mut proxy_join_set, service_entry)?;
            debug!("printing messages for {}", service_entry.service.name);
        }
        if let Some(out_dir) = &config.record_examples {
            start_example_recorder(&mut proxy_join_set, service_entry, out_dir)?;
        }
    }

    let join_res = proxy_join_set.join_next().await;
    join_res.unwrap()?
}

fn create_group(args: &config::Config, client: Client) -> Result<proxy::Group> {
    let mut group = proxy::Group::new(client);
    for (name, config) in &args.proxy {
        group.add_service(
            name,
            SocketAddr::new(config.addr, config.port),
            config.normalized_target()?,
        )?;
    }
    Ok(group)
}

async fn start_web(
    listen_on: SocketAddr,
    proxy_group: Arc<proxy::Group>,
) -> Result<JoinHandle<()>> {
    let app = Arc::new(App {
        started_at: Utc::now(),
        proxy_group: Arc::clone(&proxy_group),
    });
    let router = crate::server::router::router(app);
    let listener = tokio::net::TcpListener::bind(listen_on).await?;
    let addr = listener.local_addr()?;
    info!("Listening on {addr}");
    Ok(tokio::spawn(async move {
        axum::serve(listener, router).await.unwrap()
    }))
}

pub fn start_event_printer(tasks: &mut JoinSet<Result<()>>, entry: &ServiceEntry) -> Result<()> {
    spawn_instrumented_on(
        tasks,
        &monitor::logger_task_name(&entry.service.name),
        monitor::run_logger(entry.publisher.subscribe()),
    )?;
    Ok(())
}

fn start_example_recorder(
    tasks: &mut JoinSet<Result<()>>,
    entry: &ServiceEntry,
    out_dir: &Path,
) -> Result<()> {
    spawn_instrumented_on(
        tasks,
        &format!("recorder({})", &entry.service.name),
        monitor::run_writer(entry.publisher.subscribe(), out_dir.to_path_buf()),
    )?;
    Ok(())
}
