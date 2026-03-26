use std::net::SocketAddr;

#[derive(Debug, Clone)]
pub struct ConnInfo {
    pub protocol: String,
    pub client: SocketAddr,
}
