use std::convert::Infallible;

use axum::{
    extract::{Path, State},
    response::{
        Sse,
        sse::{Event, KeepAlive},
    },
};
use eyre::Context;
use futures::TryStreamExt;
use futures_util::stream::Stream;
use tokio_stream::StreamExt;
use tokio_stream::wrappers::BroadcastStream;
use tracing::error;

use crate::server::{messages::Operation, router::AppState};

pub async fn handle_events(
    State(AppState { app }): State<AppState>,
    Path(name): Path<String>,
) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    let service = app.proxy_group.get_service(&name).unwrap();
    let receiver = service.publisher.subscribe();
    // can also use Event::json_data for simple compact serialization
    let events = BroadcastStream::new(receiver)
        .map(|rcvd| {
            rcvd.wrap_err("receive error")
                .and_then(|op| Operation::from_op(&op).wrap_err("failed to extract operation"))
                .and_then(|op| {
                    serde_json::to_string_pretty(&op).wrap_err("failed to serialize operation")
                })
                .map(|json| Event::default().event("op-report").data(json))
        })
        .inspect_err(|err| error!("event error: {:?}", err))
        .filter_map(&Result::ok)
        .map(Ok);

    let keepalive = KeepAlive::default().event(Event::default().event("keep-alive"));

    Sse::new(events).keep_alive(keepalive)
}
