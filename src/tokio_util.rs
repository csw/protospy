use color_eyre::Result;
use tokio::task::{AbortHandle, JoinHandle, JoinSet};
use tracing::Instrument;

#[allow(dead_code)]
pub fn spawn_instrumented<Fut, T>(name: &str, future: Fut) -> Result<JoinHandle<Result<T>>>
where
    Fut: Future + Send + 'static,
    Fut::Output: Into<Result<T>> + Send + Sync,
    T: Send + Sync + 'static,
{
    Ok(tokio::task::Builder::new()
        .name(name)
        .spawn(async move { future.await.into() }.instrument(tracing::Span::current()))?)
}

pub fn spawn_instrumented_on<Fut, T>(
    join_set: &mut JoinSet<Result<T>>,
    name: &str,
    future: Fut,
) -> Result<AbortHandle>
where
    Fut: Future + Send + 'static,
    Fut::Output: Into<Result<T>> + Send + Sync,
    T: Send + Sync + 'static,
{
    Ok(join_set
        .build_task()
        .name(name)
        .spawn(async move { future.await.into() }.instrument(tracing::Span::current()))?)
}
