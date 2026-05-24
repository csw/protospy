use std::{convert::Infallible, sync::Arc};

use axum::{
    extract::{Path, State},
    response::{
        IntoResponse, Sse,
        sse::{Event, KeepAlive},
    },
};
use futures::{TryStream, TryStreamExt, stream};
use http::StatusCode;
use tokio::sync::broadcast;
use tokio_stream::StreamExt;
use tokio_stream::wrappers::BroadcastStream;
use tracing::error;
use {color_eyre::Report, eyre::Context};

use crate::{
    proxy::event::EventMessage,
    server::{errors::ErrorMessage, router::AppState},
};

pub async fn handle_events(
    State(AppState { app }): State<AppState>,
    Path(name): Path<String>,
) -> Result<impl IntoResponse, impl IntoResponse> {
    let Some((_, publisher)) = app.proxy_group.get_service(&name) else {
        return Err(ErrorMessage::response(
            StatusCode::NOT_FOUND,
            format!("Not Found: {}", &name),
        ));
    };
    let receiver = publisher.subscribe();
    // can also use Event::json_data for simple compact serialization
    let json = json_stream(receiver);
    let events = json
        .inspect_err(|err| error!("event error: {:?}", err))
        .map_ok(|json| Event::default().event("exchange-report").data(json))
        .filter_map(|res| res.ok())
        .map(Ok::<Event, Infallible>);

    let keepalive = KeepAlive::default().event(Event::default().event("keep-alive"));
    let hello = Event::default().comment("hello");
    let event_stream = stream::once(async { Ok::<Event, Infallible>(hello) }).chain(events);

    Ok(Sse::new(event_stream).keep_alive(keepalive))
}

fn json_stream(
    receiver: broadcast::Receiver<Arc<EventMessage>>,
) -> impl TryStream<Ok = String, Error = Report> {
    BroadcastStream::new(receiver).map(|rcvd| {
        rcvd.wrap_err("receive error").and_then(|evt| {
            serde_json::to_string_pretty(evt.as_ref()).wrap_err("failed to serialize exchange")
        })
    })
}
