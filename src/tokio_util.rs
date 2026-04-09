use color_eyre::Result;
use tokio::task::JoinHandle;
use tracing::Instrument;

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
