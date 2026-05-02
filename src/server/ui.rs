use axum::response::{Html, IntoResponse};
use http::{Uri, header};
use rust_embed::Embed;

#[derive(Embed)]
#[folder = "ui/dist"]
struct UiAssets;

pub async fn static_handler(uri: Uri) -> impl IntoResponse {
    let path = uri.path().trim_start_matches('/');
    match UiAssets::get(path) {
        Some(file) => {
            let mime = mime_guess::from_path(path).first_or_octet_stream();
            ([(header::CONTENT_TYPE, mime.as_ref())], file.data).into_response()
        }
        None => {
            // SPA fallback: serve index.html for unknown routes
            let index = UiAssets::get("index.html").unwrap();
            Html(
                std::str::from_utf8(index.data.as_ref())
                    .unwrap()
                    .to_string(),
            )
            .into_response()
        }
    }
}
