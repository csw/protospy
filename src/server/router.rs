use std::sync::Arc;

use axum::{Router, routing::get};

use crate::server::App;
use crate::server::ui;

#[derive(Clone)]
pub struct AppState {
    pub app: Arc<App>,
}

pub fn router(app: Arc<App>) -> Router {
    let state = AppState { app };
    Router::new()
        .route("/info", get(crate::server::info::get_info))
        .route(
            "/service/{name}/events",
            get(crate::server::events::handle_events),
        )
        .fallback(ui::static_handler)
        .with_state(state)
}
