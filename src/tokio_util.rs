use color_eyre::Result;
use tokio::task::{AbortHandle, JoinHandle, JoinSet};
use tracing::{Instrument, error};

#[cfg(tokio_unstable)]
pub fn spawn_instrumented<Fut, T>(name: &str, future: Fut) -> Result<JoinHandle<Result<T>>>
where
    Fut: Future + Send + 'static,
    Fut::Output: Into<Result<T>> + Send + Sync,
    T: Send + Sync + 'static,
{
    let err_name = name.to_owned();
    Ok(tokio::task::Builder::new().name(name).spawn(
        async move { log_err(err_name, future.await.into()) }.instrument(tracing::Span::current()),
    )?)
}

#[cfg(not(tokio_unstable))]
pub fn spawn_instrumented<Fut, T>(name: &str, future: Fut) -> Result<JoinHandle<Result<T>>>
where
    Fut: Future + Send + 'static,
    Fut::Output: Into<Result<T>> + Send + Sync,
    T: Send + Sync + 'static,
{
    let err_name = name.to_owned();
    Ok(tokio::task::spawn(
        async move { log_err(err_name, future.await.into()) }.instrument(tracing::Span::current()),
    ))
}

#[cfg(tokio_unstable)]
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
    let err_name = name.to_owned();
    Ok(join_set.build_task().name(name).spawn(
        async move { log_err(err_name, future.await.into()) }.instrument(tracing::Span::current()),
    )?)
}

#[cfg(not(tokio_unstable))]
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
    let err_name = name.to_owned();
    Ok(join_set.spawn(
        async move { log_err(err_name, future.await.into()) }.instrument(tracing::Span::current()),
    ))
}

pub fn log_err<T>(name: String, res: Result<T>) -> Result<T> {
    if let Err(err) = &res {
        error!(event = "task_error", name = name, error = ?err)
    }
    res
}
