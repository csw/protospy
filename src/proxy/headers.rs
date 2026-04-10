use std::sync::LazyLock;

use color_eyre::{Result, eyre::eyre};
use http::{HeaderMap, HeaderName, Request, Response};

use crate::proxy::server::SERVER_NAME;

use super::conn::ConnInfo;

const KEEP_ALIVE: &str = "keep-alive";
const X_FORWARDED_FOR: &str = "X-Forwarded-For";
const X_FORWARDED_HOST: &str = "X-Forwarded-Host";
const X_FORWARDED_PROTO: &str = "X-Forwarded-Proto";

static STRIP_REQUEST_HEADERS: LazyLock<Vec<HeaderName>> = LazyLock::new(|| {
    vec![
        hyper::header::CONNECTION,
        HeaderName::from_static(KEEP_ALIVE),
    ]
});

static STRIP_RESPONSE_HEADERS: LazyLock<Vec<HeaderName>> = LazyLock::new(|| {
    vec![
        hyper::header::CONNECTION,
        HeaderName::from_static(KEEP_ALIVE),
        hyper::header::PROXY_AUTHENTICATE,
    ]
});

/// Compute headers to use for the forwarded request.
pub fn request_headers<T>(target: &str, req: &Request<T>, conn: &ConnInfo) -> Result<HeaderMap> {
    let mut req_h = HeaderMap::new();
    req_h.clone_from(req.headers());
    req_h.insert(hyper::header::HOST, target.parse()?);

    if let Some(conn_str) = req_h
        .get(hyper::header::CONNECTION)
        .and_then(|v| v.to_str().ok())
        .map(&str::to_string)
    {
        for field in header_fields(&conn_str) {
            req_h.remove(field);
        }
    }

    for to_strip in STRIP_REQUEST_HEADERS.iter() {
        req_h.remove(to_strip);
    }

    req_h.append(
        hyper::header::VIA,
        via_header(req.version())?.parse().unwrap(),
    );

    // Hop-by-hop:
    // Keep-Alive, Transfer-Encoding, TE, Connection, Trailer, Upgrade, Proxy-Authorization and Proxy-Authenticate

    if let Some(host_val) = req.headers().get(hyper::header::HOST) {
        req_h.append(X_FORWARDED_HOST, host_val.clone());
    }
    req_h.append(
        X_FORWARDED_FOR,
        conn.client.ip().to_string().parse().unwrap(),
    );
    req_h.append(X_FORWARDED_PROTO, conn.protocol.parse()?);

    Ok(req_h)
}

/// Compute headers to use for the forwarded response.
pub fn response_headers<B>(orig: &Response<B>) -> Result<HeaderMap> {
    let mut headers = orig.headers().clone();
    for to_strip in STRIP_RESPONSE_HEADERS.iter() {
        headers.remove(to_strip);
    }

    headers.append(
        hyper::header::VIA,
        via_header(orig.version())?.parse().unwrap(),
    );

    Ok(headers)
}

/// Generates a Via header value, e.g. '1.1 protospy'
fn via_header(version: http::Version) -> Result<String> {
    Ok(format!("{} {}", http_version_num(version)?, SERVER_NAME))
}

/// Splits a comma-delimited header field, such as Connection.
fn header_fields(val: &str) -> impl Iterator<Item = &str> {
    val.split(',').map(str::trim)
}

/// Render an HTTP version as a bare number, e.g. 1.1, as needed for the Via
/// header.
fn http_version_num(version: http::Version) -> Result<&'static str> {
    use http::Version;
    match version {
        Version::HTTP_09 => Ok("0.9"),
        Version::HTTP_10 => Ok("1.0"),
        Version::HTTP_11 => Ok("1.1"),
        Version::HTTP_2 => Ok("2"),
        Version::HTTP_3 => Ok("3"),
        _ => Err(eyre!("unhandled HTTP version {:?}", version)),
    }
}

#[cfg(test)]
mod tests {

    use std::collections::HashMap;
    use std::hash::RandomState;

    use http::request::Builder;
    use http_body_util::Empty;
    use hyper::body::Bytes;

    use super::*;

    const CLIENT_IP: &str = "127.0.0.1";
    const CLIENT: &str = "127.0.0.1:45678";
    const TARGET: &str = "localhost:80";

    // ==== Request tests ====

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
    fn test_request_via() {
        let h = build_mapped_req(|b| b);
        assert_eq!(header_val(&h, "Via"), Some("1.1 protospy"));
    }

    #[test]
    fn test_host() {
        let h = build_mapped_req(|b| b.header("Host", "localhost:3000"));
        assert_eq!(header_val(&h, "host"), Some(TARGET))
    }

    // ==== Response tests ====

    #[test]
    fn test_res_strip_connection() {
        let h =
            basic_response_headers(&[("connection", "keep-alive"), ("keep-alive", "timeout=5")]);
        assert!(!h.contains_key("connection"));
        assert!(!h.contains_key("keep-alive"));
    }

    #[test]
    fn test_res_strip_proxy_authenticate() {
        let h = basic_response_headers(&[
            ("connection", "keep-alive"),
            ("keep-alive", "timeout=5"),
            (
                "proxy-authenticate",
                "Basic realm=\"Dev\", charset=\"UTF-8\"",
            ),
        ]);
        assert!(!h.contains_key("proxy-authenticate"));
    }

    #[test]
    fn test_res_strip_lone_keep_alive() {
        let h = basic_response_headers(&[("keep-alive", "timeout=5")]);
        assert!(!h.contains_key("keep-alive"));
    }

    #[test]
    fn test_res_via() {
        let h = response_headers(
            &Response::builder()
                .version(http::Version::HTTP_11)
                .body(())
                .unwrap(),
        )
        .unwrap();
        assert_eq!(header_val(&h, "Via"), Some("1.1 protospy"));
    }

    fn make_headers(literals: &[(&str, &str)]) -> HeaderMap {
        let strings = literals.iter().map(|(k, v)| (k.to_string(), v.to_string()));
        let m1 = HashMap::<String, String, RandomState>::from_iter(strings);
        HeaderMap::try_from(&m1).expect("valid headers")
    }

    fn basic_response(headers: HeaderMap) -> Response<()> {
        let mut builder = Response::builder()
            .status(200)
            .version(http::Version::HTTP_11);
        *builder.headers_mut().unwrap() = headers;
        builder.body(()).unwrap()
    }

    fn basic_response_headers(header_literals: &[(&str, &str)]) -> HeaderMap {
        response_headers(&basic_response(make_headers(header_literals))).unwrap()
    }

    fn build_mapped_req(modify: impl Fn(Builder) -> Builder) -> HeaderMap {
        let req = modify(Builder::new()).body(empty()).unwrap();
        request_headers(TARGET, &req, &conn()).unwrap()
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
