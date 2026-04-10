use strum::Display;

#[derive(Clone, Copy, Display)]
pub enum Cause {
    ConnectFailed,
    ConnectionError,
    RequestError,
}
