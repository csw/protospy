use strum::Display;

#[derive(Display)]
pub enum Cause {
    ConnectFailed,
    ConnectionError,
}
