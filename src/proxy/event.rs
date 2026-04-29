use bytes::Bytes;
use chrono::TimeDelta;

use serde::{Serialize, Serializer};

use crate::proxy::{
    body::{self, Direction},
    headers::http_version_num,
    reporting::ExchangeMeta,
};

#[derive(ts_rs::TS)]
#[ts(export)]
#[derive(Serialize, Debug)]
pub struct EventMessage {
    pub exchange: ExchangeMeta,
    pub direction: Direction,
    pub event: Event,
}

#[derive(Serialize, PartialEq, Debug, ts_rs::TS)]
#[ts(rename = "ProxyHeaders")]
pub struct Headers(Vec<Header>);

#[derive(ts_rs::TS, Serialize, PartialEq, Debug)]
#[serde(rename_all = "lowercase", tag = "type")]
pub enum Event {
    Request {
        #[serde(serialize_with = "serialize_as_str")]
        #[ts(type = "string")]
        method: http::Method,
        uri: String,
        #[serde(serialize_with = "serialize_http_version")]
        #[ts(type = "string")]
        version: http::Version,
        headers: Headers,
        body: InitialBody,
    },
    Response {
        #[serde(serialize_with = "serialize_http_status")]
        #[ts(type = "string")]
        status: http::StatusCode,
        #[serde(serialize_with = "serialize_http_version")]
        #[ts(type = "string")]
        version: http::Version,
        headers: Headers,
        elapsed_ms: i64,
        body: InitialBody,
    },
    BodyData(BodyData),
    Error {
        direction: Direction,
        message: String,
    },
}

#[derive(Serialize, PartialEq, Debug, ts_rs::TS)]
pub struct BodyData {
    pub content: Option<BodyContent>,
    pub trailers: Option<Headers>,
    pub at_end: bool,
    pub total_bytes: usize,
}

#[derive(Serialize, PartialEq, Debug, ts_rs::TS)]
pub struct BodyContent {
    pub offset: usize,
    pub length: usize,
    pub payload: BodyChunk,
}

#[derive(Serialize, PartialEq, Debug, ts_rs::TS)]
pub struct Header {
    #[serde(serialize_with = "serialize_as_str")]
    #[ts(type = "string")]
    name: http::HeaderName,
    #[serde(serialize_with = "serialize_http_header_value")]
    #[ts(type = "string")]
    value: http::HeaderValue,
}

#[derive(Serialize, PartialEq, Debug, ts_rs::TS)]
#[serde(tag = "type")]
pub enum InitialBody {
    NoBody,
    NotRead,
    Data(BodyData),
}

#[derive(Serialize, PartialEq, Debug, ts_rs::TS)]
#[serde(rename_all = "lowercase")]
pub enum BodyChunk {
    Text(String),
    #[serde(with = "base64_bytes")]
    #[ts(type = "string")]
    Binary(Bytes),
}

impl Event {
    pub fn from_request(request: http::request::Parts, body_data: body::FoundBodyData) -> Self {
        Self::Request {
            method: request.method,
            uri: request.uri.to_string(),
            version: request.version,
            headers: request.headers.into(),
            body: InitialBody::from_found(body_data),
        }
    }

    pub fn from_response(
        response: http::response::Parts,
        body_data: body::FoundBodyData,
        elapsed: TimeDelta,
    ) -> Self {
        Self::Response {
            status: response.status,
            version: response.version,
            headers: response.headers.into(),
            elapsed_ms: elapsed.num_milliseconds(),
            body: InitialBody::from_found(body_data),
        }
    }
}

impl From<BodyData> for Event {
    fn from(value: BodyData) -> Self {
        Self::BodyData(value)
    }
}

impl BodyData {
    pub fn from_content(
        body::BodyContent { data, trailers }: body::BodyContent,
        at_end: bool,
    ) -> Self {
        let len = data.len();
        Self {
            content: Some(BodyContent {
                offset: 0,
                length: len,
                payload: data.into(),
            }),
            trailers: trailers.map(Into::into),
            at_end,
            total_bytes: len,
        }
    }
}

impl InitialBody {
    fn from_found(body_data: body::FoundBodyData) -> Self {
        match body_data {
            body::FoundBodyData::NoBody => InitialBody::NoBody,
            body::FoundBodyData::NoneRead => InitialBody::NotRead,
            body::FoundBodyData::Partial(content) => {
                InitialBody::Data(BodyData::from_content(content, false))
            }
            body::FoundBodyData::Complete(content) => {
                InitialBody::Data(BodyData::from_content(content, true))
            }
        }
    }
}

impl From<Vec<u8>> for BodyChunk {
    fn from(value: Vec<u8>) -> Self {
        match String::from_utf8(value) {
            Ok(str) => BodyChunk::Text(str),
            Err(err) => BodyChunk::Binary(err.into_bytes().into()),
        }
    }
}

impl From<&'static [u8]> for BodyChunk {
    fn from(value: &'static [u8]) -> Self {
        Vec::<u8>::from(value).into()
    }
}

impl<const N: usize> From<&'static [u8; N]> for BodyChunk {
    fn from(value: &'static [u8; N]) -> Self {
        Vec::<u8>::from(value).into()
    }
}

impl From<&http::HeaderMap> for Headers {
    fn from(value: &http::HeaderMap) -> Self {
        Headers(
            value
                .iter()
                .map(|(name, value)| Header {
                    name: name.clone(),
                    value: value.clone(),
                })
                .collect(),
        )
    }
}

impl From<http::HeaderMap> for Headers {
    fn from(value: http::HeaderMap) -> Self {
        Headers(
            value
                .into_iter()
                .filter_map(|(name, value)| name.map(|name| (name, value)))
                .map(|(name, value)| Header { name, value })
                .collect(),
        )
    }
}

pub fn flatten_headers(headers: &http::HeaderMap) -> Vec<Header> {
    headers
        .iter()
        .map(|(name, value)| Header {
            name: name.clone(),
            value: value.clone(),
        })
        .collect()
}

fn serialize_http_version<S: Serializer>(version: &http::Version, s: S) -> Result<S::Ok, S::Error> {
    http_version_num(*version)
        .map_err(|_| serde::ser::Error::custom(format!("invalid HTTP version: {version:?}")))
        .and_then(|v| s.serialize_str(v))
}

fn serialize_as_str<T: AsRef<str>, S: Serializer>(val: &T, s: S) -> Result<S::Ok, S::Error> {
    s.serialize_str(val.as_ref())
}

fn serialize_http_status<S: Serializer>(
    status: &http::StatusCode,
    s: S,
) -> Result<S::Ok, S::Error> {
    s.serialize_str(status.as_str())
}

fn serialize_http_header_value<S: Serializer>(
    value: &http::HeaderValue,
    s: S,
) -> Result<S::Ok, S::Error> {
    value
        .to_str()
        .map_err(|_| serde::ser::Error::custom(format!("invalid HTTP header value: {value:?}")))
        .and_then(|str| s.serialize_str(str))
}
