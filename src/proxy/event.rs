use bytes::Bytes;
use chrono::TimeDelta;

use serde::{Serialize, Serializer};

use crate::proxy::{
    body::{self, Direction},
    headers::http_version_num,
    reporting::ExchangeMeta,
};

#[derive(Serialize, Debug)]
pub struct EventMessage {
    pub exchange: ExchangeMeta,
    pub event: Event,
}

type Headers = Vec<Header>;

#[derive(Serialize, PartialEq, Debug)]
#[serde(rename_all = "lowercase")]
pub enum Event {
    Request {
        #[serde(serialize_with = "serialize_as_str")]
        method: http::Method,
        uri: String,
        #[serde(serialize_with = "serialize_http_version")]
        version: http::Version,
        headers: Headers,
        body: InitialBody,
        trailers: Option<Headers>,
    },
    Response {
        #[serde(serialize_with = "serialize_http_status")]
        status: http::StatusCode,
        #[serde(serialize_with = "serialize_http_version")]
        version: http::Version,
        headers: Headers,
        elapsed_ms: i64,
        body: InitialBody,
        trailers: Option<Headers>,
    },
    BodyData {
        direction: Direction,
        bytes: usize,
        payload: BodyData,
    },
    Trailers {
        direction: Direction,
        entries: Headers,
    },
    BodyEnd {
        direction: Direction,
        seen: bool,
        total_bytes: usize,
    },
    Error {
        message: String,
    },
}

#[derive(Serialize, PartialEq, Debug)]
pub struct Header {
    #[serde(serialize_with = "serialize_as_str")]
    name: http::HeaderName,
    #[serde(serialize_with = "serialize_http_header_value")]
    value: http::HeaderValue,
}

#[derive(Serialize, PartialEq, Debug)]
pub enum InitialBody {
    NoBody,
    NotRead,
    Partial(BodyData),
    Complete(BodyData),
}

#[derive(Serialize, PartialEq, Debug)]
#[serde(rename_all = "lowercase")]
pub enum BodyData {
    Text(String),
    #[serde(with = "base64_bytes")]
    Binary(Bytes),
}

impl Event {
    pub fn from_request(request: http::request::Parts, body_data: body::FoundBodyData) -> Self {
        let trailers = body_data.trailers().map(flatten_headers);

        Self::Request {
            method: request.method,
            uri: request.uri.to_string(),
            version: request.version,
            headers: flatten_headers(&request.headers),
            body: InitialBody::from_found(body_data),
            trailers,
        }
    }

    pub fn from_response(
        response: http::response::Parts,
        body_data: body::FoundBodyData,
        elapsed: TimeDelta,
    ) -> Self {
        let trailers = body_data.trailers().map(flatten_headers);

        Self::Response {
            status: response.status,
            version: response.version,
            headers: flatten_headers(&response.headers),
            elapsed_ms: elapsed.num_milliseconds(),
            body: InitialBody::from_found(body_data),
            trailers,
        }
    }
}

impl InitialBody {
    fn from_found(body_data: body::FoundBodyData) -> Self {
        match body_data {
            body::FoundBodyData::NoBody => InitialBody::NoBody,
            body::FoundBodyData::NoneRead => InitialBody::NotRead,
            body::FoundBodyData::Partial(body::BodyContent { data, .. }) => {
                InitialBody::Partial(data.into())
            }
            body::FoundBodyData::Complete(body::BodyContent { data, .. }) => {
                InitialBody::Complete(data.into())
            }
        }
    }
}

impl From<Vec<u8>> for BodyData {
    fn from(value: Vec<u8>) -> Self {
        match String::from_utf8(value) {
            Ok(str) => BodyData::Text(str),
            Err(err) => BodyData::Binary(err.into_bytes().into()),
        }
    }
}

impl From<&'static [u8]> for BodyData {
    fn from(value: &'static [u8]) -> Self {
        Vec::<u8>::from(value).into()
    }
}

impl<const N: usize> From<&'static [u8; N]> for BodyData {
    fn from(value: &'static [u8; N]) -> Self {
        Vec::<u8>::from(value).into()
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
