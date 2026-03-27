use http::{HeaderMap, HeaderValue, Request};

use super::conn::ConnInfo;

const KEEP_ALIVE: &str = "Keep-Alive";
const X_FORWARDED_FOR: &str = "X-Forwarded-For";
const X_FORWARDED_HOST: &str = "X-Forwarded-Host";
const X_FORWARDED_PROTO: &str = "X-Forwarded-Proto";

pub fn build<T>(
    proxy: &super::Server,
    req: &Request<T>,
    conn: &ConnInfo,
    res_h: &mut HeaderMap<HeaderValue>,
) {
    res_h.clone_from(req.headers());
    res_h.insert(hyper::header::HOST, proxy.target.parse().unwrap());

    res_h.remove(KEEP_ALIVE);

    if let Some(host_val) = req.headers().get(hyper::header::HOST) {
        res_h.append(X_FORWARDED_HOST, host_val.clone());
    }
    res_h.append(
        X_FORWARDED_FOR,
        conn.client.ip().to_string().parse().unwrap(),
    );
    res_h.append(X_FORWARDED_PROTO, conn.protocol.parse().unwrap());
}

#[cfg(test)]
mod tests {

    use http::request::Builder;
    use http_body_util::Empty;
    use hyper::body::Bytes;

    use super::super::Server;
    use super::*;

    type BuilderMod = fn(Builder) -> Builder;

    const CLIENT_IP: &str = "127.0.0.1";
    const CLIENT: &str = "127.0.0.1:45678";
    const TARGET: &str = "localhost:80";

    #[test]
    fn test_x_forwarded_for_added() {
        let req = Builder::new().body(empty()).unwrap();
        let mut h = HeaderMap::new();
        build(&server(), &req, &conn(), &mut h);
        assert_eq!(
            h.get("X-Forwarded-For").map(|v| v.to_str().unwrap()),
            Some(CLIENT_IP)
        )
    }

    #[test]
    fn test_x_forwarded_for_appended() {
        let orig = "192.168.1.1";
        let req = Builder::new()
            .header("x-forwarded-for", orig)
            .body(empty())
            .unwrap();
        let mut h = HeaderMap::new();
        build(&server(), &req, &conn(), &mut h);
        assert_eq!(header_vals(&h, "X-Forwarded-For"), vec!(orig, CLIENT_IP))
    }

    #[test]
    fn test_x_forwarded_proto_added() {
        let req = Builder::new().body(empty()).unwrap();
        let mut h = HeaderMap::new();
        build(&server(), &req, &conn(), &mut h);
        assert_eq!(
            h.get("X-Forwarded-Proto").map(|v| v.to_str().unwrap()),
            Some("http")
        )
    }

    #[test]
    fn test_x_forwarded_host_added() {
        let orig = "localhost:3000";
        let req = Builder::new()
            .header(hyper::header::HOST, orig)
            .body(empty())
            .unwrap();
        let mut h = HeaderMap::new();
        build(&server(), &req, &conn(), &mut h);
        assert_eq!(
            h.get("X-Forwarded-Host").map(|v| v.to_str().unwrap()),
            Some(orig)
        );
        assert_eq!(header_val(&h, "X-Forwarded-Host"), Some(orig));
    }

    #[test]
    fn test_x_forwarded_host_appended() {
        let orig = "localhost:3000";
        let orig_fwd = "altair:80";
        let req = Builder::new()
            .header("Host", orig)
            .header("X-Forwarded-Host", orig_fwd)
            .body(empty())
            .unwrap();
        let mut h = HeaderMap::new();
        build(&server(), &req, &conn(), &mut h);
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

    fn build_mapped(modify: BuilderMod) -> HeaderMap {
        let req = modify(Builder::new()).body(empty()).unwrap();
        let mut h = HeaderMap::new();
        build(&server(), &req, &conn(), &mut h);
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
