use axum::{Json, response::IntoResponse};
use http::StatusCode;
use serde::Serialize;

#[derive(Serialize)]
pub struct ErrorMessage {
    message: String,
}

impl ErrorMessage {
    pub fn new(message: String) -> Self {
        ErrorMessage { message }
    }

    pub fn response(status: StatusCode, message: String) -> impl IntoResponse {
        (status, Json(Self::new(message)))
    }
}
