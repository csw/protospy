use std::sync::LazyLock;

use color_eyre::Result;
use http::{HeaderMap, HeaderName, HeaderValue, Request};

use super::conn::ConnInfo;

const KEEP_ALIVE: &str = "keep-alive";
const X_FORWARDED_FOR: &str = "X-Forwarded-For";
const X_FORWARDED_HOST: &str = "X-Forwarded-Host";
const X_FORWARDED_PROTO: &str = "X-Forwarded-Proto";

static STRIP_HEADERS: LazyLock<Vec<HeaderName>> = LazyLock::new(|| {
    vec![
        hyper::header::CONNECTION,
        HeaderName::from_static(KEEP_ALIVE),
    ]
});

pub fn build<T>(
    proxy: &super::Server,
    req: &Request<T>,
    conn: &ConnInfo,
    res_h: &mut HeaderMap<HeaderValue>,
) -> Result<()> {
    res_h.clone_from(req.headers());
    res_h.insert(hyper::header::HOST, proxy.target.parse()?);

    if let Some(conn_str) = res_h
        .get(hyper::header::CONNECTION)
        .and_then(|v| v.to_str().ok())
        .map(&str::to_string)
    {
        for field in header_fields(&conn_str) {
            res_h.remove(field);
        }
    }

    for to_strip in STRIP_HEADERS.iter() {
        res_h.remove(to_strip);
    }

    // Hop-by-hop:
    // Keep-Alive, Transfer-Encoding, TE, Connection, Trailer, Upgrade, Proxy-Authorization and Proxy-Authenticate

    if let Some(host_val) = req.headers().get(hyper::header::HOST) {
        res_h.append(X_FORWARDED_HOST, host_val.clone());
    }
    res_h.append(
        X_FORWARDED_FOR,
        conn.client.ip().to_string().parse().unwrap(),
    );
    res_h.append(X_FORWARDED_PROTO, conn.protocol.parse()?);

    Ok(())
}

fn header_fields(val: &str) -> impl Iterator<Item = &str> {
    val.split(',').map(|s| s.trim())
}

#[cfg(test)]
mod tests {

    use http::request::Builder;
    use http_body_util::Empty;
    use hyper::body::Bytes;

    use crate::server::client;

    use super::super::Server;
    use super::*;

    const CLIENT_IP: &str = "127.0.0.1";
    const CLIENT: &str = "127.0.0.1:45678";
    const TARGET: &str = "localhost:80";

    #[test]
    fn test_x_forwarded_for_added() {
        let h = build_mapped(|b| b);
        assert_eq!(header_val(&h, "X-Forwarded-For"), Some(CLIENT_IP))
    }

    #[test]
    fn test_x_forwarded_for_appended() {
        let orig = "192.168.1.1";
        let h = build_mapped(|b| b.header("x-forwarded-for", orig));
        assert_eq!(header_vals(&h, "X-Forwarded-For"), vec!(orig, CLIENT_IP))
    }

    #[test]
    fn test_x_forwarded_proto_added() {
        let h = build_mapped(|b| b);
        assert_eq!(header_val(&h, "X-Forwarded-Proto"), Some("http"));
    }

    #[test]
    fn test_x_forwarded_host_added() {
        let orig = "localhost:3000";
        let h = build_mapped(|b| b.header(hyper::header::HOST, orig));
        assert_eq!(header_val(&h, "X-Forwarded-Host"), Some(orig));
    }

    #[test]
    fn test_x_forwarded_host_appended() {
        let orig = "localhost:3000";
        let orig_fwd = "altair:80";
        let h = build_mapped(|b| b.header("Host", orig).header("X-Forwarded-Host", orig_fwd));
        assert_eq!(header_vals(&h, "X-Forwarded-Host"), vec!(orig_fwd, orig))
    }

    #[test]
    fn test_keep_alive_stripped() {
        let h = build_mapped(|b| b.header(KEEP_ALIVE, "timeout=5"));
        assert!(!h.contains_key(KEEP_ALIVE));
    }

    #[test]
    fn test_host() {
        let h = build_mapped(|b| b.header("Host", "localhost:3000"));
        assert_eq!(header_val(&h, "host"), Some(TARGET))
    }

    fn build_mapped(modify: impl Fn(Builder) -> Builder) -> HeaderMap {
        let req = modify(Builder::new()).body(empty()).unwrap();
        let mut h = HeaderMap::new();
        build(&server(), &req, &conn(), &mut h).unwrap();
        h
    }

    fn header_val<'a>(headers: &'a HeaderMap, name: &'a str) -> Option<&'a str> {
        headers.get(name).map(|v| v.to_str().unwrap())
    }

    fn header_vals<'a>(headers: &'a HeaderMap, name: &'a str) -> Vec<&'a str> {
        headers
            .get_all(name)
            .iter()
            .map(|v| v.to_str().unwrap())
            .collect::<Vec<_>>()
    }

    fn server() -> Server {
        Server {
            addr: "127.0.0.1:8080".parse().unwrap(),
            target: TARGET.to_string(),
            client: client::build(),
        }
    }

    fn conn() -> ConnInfo {
        ConnInfo {
            protocol: "http".to_string(),
            client: CLIENT.parse().unwrap(),
        }
    }

    fn empty() -> Empty<Bytes> {
        Empty::<Bytes>::new()
    }
}
