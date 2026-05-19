use axum::{Json, extract::State};
use chrono::prelude::*;
use serde::Serialize;

use crate::{
    proxy::{self, group::ServiceEntry},
    server::router::AppState,
};

#[derive(Serialize, Debug, ts_rs::TS)]
#[ts(export)]
pub struct Info {
    started_at: DateTime<Utc>,
    services: Vec<Service>,
}

#[derive(Serialize, Debug, ts_rs::TS)]
struct Service {
    name: String,
    addr: String,
    target: String,
    protocol: Option<proxy::Protocol>,
    subscribers: usize,
}

pub async fn get_info(State(state): State<AppState>) -> Json<Info> {
    let app = state.app;
    let services = app
        .proxy_group
        .services
        .iter()
        .map(|ServiceEntry { service, publisher }| Service {
            name: service.name.clone(),
            addr: service.addr.to_string(),
            target: service.target.to_string(),
            protocol: service.protocol.clone(),
            subscribers: publisher.listener_count(),
        })
        .collect();
    let info = Info {
        started_at: app.started_at,
        services,
    };

    Json(info)
}
