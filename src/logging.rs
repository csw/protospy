use color_eyre::{Result, config::Frame};
use console_subscriber::ConsoleLayer;
use tracing::{info, level_filters::LevelFilter};
use tracing_error::ErrorLayer;
use tracing_subscriber::util::SubscriberInitExt;
use tracing_subscriber::{self, EnvFilter};
use tracing_subscriber::{prelude::*, registry::Registry};

/// Set up event logging and error reporting.
pub fn init(enable_console: bool) -> Result<()> {
    // set up standard logging
    let log_filter = EnvFilter::builder()
        .with_default_directive(LevelFilter::INFO.into())
        .from_env()?;
    let log_layer = tracing_subscriber::fmt::layer().with_filter(log_filter);
    let console_layer = enable_console.then(|| ConsoleLayer::builder().with_default_env().spawn());

    // register tracing layers for logging and errors with color-eyre
    Registry::default()
        .with(ErrorLayer::default())
        .with(log_layer)
        .with(console_layer)
        .init();

    if enable_console {
        info!("enabled tokio-console support");
    }

    // filter backtrace frames for only ours; otherwise we get about 50
    // infrastructure frames.
    color_eyre::config::HookBuilder::default()
        .add_frame_filter(Box::new(&our_frames_filter))
        .install()
}

fn our_frames_filter(frames: &mut Vec<&Frame>) {
    frames.retain(|frame| {
        frame
            .name
            .as_ref()
            .is_some_and(|name| name.starts_with("protospy::"))
    });
}
