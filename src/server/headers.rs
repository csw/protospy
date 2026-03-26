use http::{HeaderMap, HeaderValue, Request};

use super::conn::ConnInfo;

pub fn build<T>(
    proxy: &super::Server,
    req: &Request<T>,
    conn: &ConnInfo,
    res_h: &mut HeaderMap<HeaderValue>,
) {
    let authority = format!("http://{}", proxy.target);

    res_h.clone_from(req.headers());
    res_h.insert(hyper::header::HOST, authority.parse().unwrap());

    res_h.append("x-forwarded-for", conn.client.to_string().parse().unwrap());
    res_h.append("x-forwarded-proto", conn.protocol.parse().unwrap());
}
