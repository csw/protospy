use axum::{
    Router,
    routing::{any, get},
};

pub fn app() -> Router {
    Router::new()
        .route("/", get(|| async { "Hello, world!" }))
        .route("/ws", any(crate::server::ws::handler))
}
