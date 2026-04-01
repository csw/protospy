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

pub fn build_request<T>(
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

pub fn response_headers(orig: &HeaderMap) -> Result<HeaderMap> {
    let mut headers = orig.clone();
    for to_strip in STRIP_HEADERS.iter() {
        headers.remove(to_strip);
    }
    Ok(headers)
}

/// Splits a comma-delimited header field, such as Connection.
fn header_fields(val: &str) -> impl Iterator<Item = &str> {
    val.split(',').map(|s| s.trim())
}

#[cfg(test)]
mod tests {

    use std::collections::HashMap;
    use std::hash::RandomState;

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
        let h = build_mapped_req(|b| b);
        assert_eq!(header_val(&h, "X-Forwarded-For"), Some(CLIENT_IP))
    }

    #[test]
    fn test_x_forwarded_for_appended() {
        let orig = "192.168.1.1";
        let h = build_mapped_req(|b| b.header("x-forwarded-for", orig));
        assert_eq!(header_vals(&h, "X-Forwarded-For"), vec!(orig, CLIENT_IP))
    }

    #[test]
    fn test_x_forwarded_proto_added() {
        let h = build_mapped_req(|b| b);
        assert_eq!(header_val(&h, "X-Forwarded-Proto"), Some("http"));
    }

    #[test]
    fn test_x_forwarded_host_added() {
        let orig = "localhost:3000";
        let h = build_mapped_req(|b| b.header(hyper::header::HOST, orig));
        assert_eq!(header_val(&h, "X-Forwarded-Host"), Some(orig));
    }

    #[test]
    fn test_x_forwarded_host_appended() {
        let orig = "localhost:3000";
        let orig_fwd = "altair:80";
        let h = build_mapped_req(|b| b.header("Host", orig).header("X-Forwarded-Host", orig_fwd));
        assert_eq!(header_vals(&h, "X-Forwarded-Host"), vec!(orig_fwd, orig))
    }

    #[test]
    fn test_keep_alive_stripped() {
        let h = build_mapped_req(|b| b.header(KEEP_ALIVE, "timeout=5"));
        assert!(!h.contains_key(KEEP_ALIVE));
    }

    #[test]
    fn test_host() {
        let h = build_mapped_req(|b| b.header("Host", "localhost:3000"));
        assert_eq!(header_val(&h, "host"), Some(TARGET))
    }

    #[test]
    fn test_res_strip_connection() {
        let h = response_headers(&make_headers(&[
            ("connection", "keep-alive"),
            ("keep-alive", "timeout=5"),
        ]))
        .unwrap();
        assert!(!h.contains_key("connection"));
        assert!(!h.contains_key("keep-alive"));
    }

    #[test]
    fn test_res_strip_lone_keep_alive() {
        let h = response_headers(&make_headers(&[("keep-alive", "timeout=5")])).unwrap();
        assert!(!h.contains_key("keep-alive"));
    }

    fn make_headers(literals: &[(&str, &str)]) -> HeaderMap {
        let strings = literals.iter().map(|(k, v)| (k.to_string(), v.to_string()));
        let m1 = HashMap::<String, String, RandomState>::from_iter(strings);
        HeaderMap::try_from(&m1).expect("valid headers")
    }

    fn build_mapped_req(modify: impl Fn(Builder) -> Builder) -> HeaderMap {
        let req = modify(Builder::new()).body(empty()).unwrap();
        let mut h = HeaderMap::new();
        build_request(&server(), &req, &conn(), &mut h).unwrap();
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
