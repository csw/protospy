use axum::{Json, extract::State};
use serde::Serialize;

use crate::server::router::AppState;

#[derive(Serialize, Debug)]
pub struct Info {
    services: Vec<Service>,
}

#[derive(Serialize, Debug)]
struct Service {
    name: String,
    addr: String,
    target: String,
    subscribers: usize,
}

pub async fn get_info(State(state): State<AppState>) -> Json<Info> {
    let app = state.app;
    let services = app
        .proxy_group
        .services
        .iter()
        .map(|svc| Service {
            name: svc.name.clone(),
            addr: svc.addr.to_string(),
            target: svc.target.clone(),
            subscribers: svc.publisher.listener_count(),
        })
        .collect();
    let info = Info { services };

    Json(info)
}
