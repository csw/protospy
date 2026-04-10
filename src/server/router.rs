use std::sync::Arc;

use axum::{
    Router,
    routing::{any, get},
};

use crate::server::App;

#[derive(Clone)]
pub struct AppState {
    pub app: Arc<App>,
}

pub fn router(app: Arc<App>) -> Router {
    let state = AppState { app };
    Router::new()
        .route("/", get(|| async { "Hello, world!" }))
        .route("/info", get(crate::server::info::get_info))
        .route("/ws", any(crate::server::ws::handler))
        .with_state(state)
}
