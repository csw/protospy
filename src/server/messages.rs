use bytes::Bytes;
use color_eyre::Result;
use serde::Serialize;

use crate::proxy::headers::http_version_num;
use crate::proxy::op;

#[derive(Serialize)]
pub struct Operation {
    request: Request,
    response: Response,
}

#[derive(Serialize)]
pub struct Request {
    method: String,
    uri: String,
    version: String,
    headers: Vec<Header>,
    body: Body,
}

#[derive(Serialize)]
pub struct Response {
    status: u16,
    version: String,
    headers: Vec<Header>,
    body: Body,
}

#[derive(Serialize)]
pub struct Header {
    name: String,
    value: String,
}

#[derive(Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Body {
    None,
    Text(String),
    #[serde(with = "base64_bytes")]
    Binary(Bytes),
}

impl Operation {
    pub fn from_op(
        op::Op {
            request_parts: req,
            request_body: req_body,
            response_parts: res,
            response_body: res_body,
            conn: _,
        }: &op::Op,
    ) -> Result<Operation> {
        Ok(Operation {
            request: Request {
                method: req.method.to_string(),
                uri: req.uri.to_string(),
                version: http_version_num(req.version)?.to_string(),
                headers: flatten_headers(&req.headers),
                body: req_body.into(),
            },
            response: Response {
                status: res.status.as_u16(),
                version: http_version_num(res.version)?.to_string(),
                headers: flatten_headers(&res.headers),
                body: res_body.into(),
            },
        })
    }
}

impl From<&op::TrackedBodyData> for Body {
    fn from(value: &op::TrackedBodyData) -> Self {
        if !value.saw_body {
            Self::None
        } else if let Ok(text) = str::from_utf8(&value.data) {
            Self::Text(text.to_string())
        } else {
            Self::Binary(Bytes::copy_from_slice(&value.data))
        }
    }
}

fn flatten_headers(headers: &http::HeaderMap) -> Vec<Header> {
    headers
        .iter()
        .map(|(name, value)| Header {
            name: name.to_string(),
            value: value.to_str().unwrap_or("<binary>").into(),
        })
        .collect()
}
