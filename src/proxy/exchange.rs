use std::sync::Arc;

use chrono::{TimeDelta, prelude::*};
use color_eyre::{Result, eyre::eyre};
use http::{Request, Response};
use tracing::{debug, error, instrument};

use crate::{
    proxy::{
        Service,
        body::{self, ProxyResponse},
        conn::ConnInfo,
        errors,
        event::Event,
        headers,
        reporting::{self, EventReporter, ExchangeMeta},
        service,
    },
    tokio_util::spawn_instrumented_on,
};

pub const SERVER_NAME: &str = "protospy";

pub struct Exchange {
    service: Arc<Service>,
    should_report: bool,
    meta: ExchangeMeta,
    conn: ConnInfo,
}

impl Exchange {
    pub fn new(service: Arc<Service>, should_report: bool, conn: ConnInfo) -> Self {
        Self {
            service,
            should_report,
            meta: Default::default(),
            conn,
        }
    }

    pub async fn process(
        &mut self,
        incoming_request: Request<body::Internal>,
    ) -> Result<ProxyResponse> {
        let upstream_request = match self.build_upstream_request(incoming_request).await {
            Ok(request) => request,
            Err(err) => {
                return if let Some(hyper_err) = errors::find_in_eyre_chain::<hyper::Error>(&err) {
                    error!(event = "request_body_error", error = ?err, cause = ?hyper_err);
                    service::error_http_response(
                        http::StatusCode::BAD_REQUEST,
                        errors::Cause::RequestError,
                    )
                } else {
                    service::internal_error_response(
                        err.wrap_err("failed to build upstream request"),
                    )
                };
            }
        };

        let sent_at = Utc::now();

        // send the request to the upstream server
        let upstream_response = match self.service.client.request(upstream_request).await {
            Ok(response) => body::map_response_body(response, body::wrapped),
            Err(upstream_err) => return service::client_error_response(&upstream_err),
        };
        let elapsed = Utc::now() - sent_at;

        // handle the response
        match self.process_response(upstream_response, elapsed).await {
            Ok(response) => Ok(response),
            Err(err) => service::internal_error_response(
                err.wrap_err("failed to build downstream response"),
            ),
        }
    }

    async fn build_upstream_request(
        &mut self,
        incoming_request: Request<body::Internal>,
    ) -> Result<Request<body::upstream::RequestBody>> {
        let (incoming_request, orig_req_parts) = clone_request_parts(incoming_request);

        // transform the request for upstream
        let proxy_request = self.transform_request_parts(incoming_request)?;
        // set up for reporting, if needed
        if self.should_report {
            let reporter = self.service.reporter_service.make_reporter(self.meta);
            self.track_request(reporter, proxy_request, orig_req_parts)
                .await
        } else {
            Ok(body::map_request_body(proxy_request, body::wrapped))
        }
    }

    fn transform_request_parts(
        &self,
        request: Request<body::Internal>,
    ) -> Result<Request<body::Internal>> {
        let req_uri = request.uri();

        let target_uri = self.service.map_uri(req_uri)?;
        let authority = self
            .service
            .target
            .authority()
            .expect("must have authority")
            .as_str();
        let req_headers = headers::request_headers(authority, &request, &self.conn)?;
        let (req_parts, req_body) = request.into_parts();

        let mut target_req_builder = Request::builder()
            .method(&req_parts.method)
            .uri(target_uri.clone());
        *target_req_builder
            .headers_mut()
            .ok_or_else(|| eyre!("invalid request builder state for headers"))? = req_headers;
        Ok(target_req_builder.body(req_body)?)
    }

    #[instrument(level = "info", skip_all)]
    async fn track_request(
        &mut self,
        mut reporter: Box<dyn EventReporter>,
        request: Request<body::Internal>,
        orig_parts: http::request::Parts,
    ) -> Result<Request<body::upstream::RequestBody>> {
        let (parts, orig_body) = request.into_parts();
        let (found_body_data, prefetched) = body::collect_ready_data(orig_body).await?;

        let event = Event::from_request(orig_parts, found_body_data);
        reporter.send_event(body::Direction::Request, event)?;

        let upstream_body = self
            .tracked_body(prefetched, reporter, body::Direction::Request)
            .await?;

        Ok(Request::from_parts(parts, upstream_body))
    }

    /// Process the response, transforming headers, reporting if appropriate,
    /// and handling the body.
    async fn process_response(
        &mut self,
        response: Response<body::Internal>,
        elapsed: TimeDelta,
    ) -> Result<ProxyResponse> {
        // report if appropriate
        if self.should_report {
            let (response, orig_parts) = clone_response_parts(response);

            let response = Self::transform_response_parts(response)?;
            let reporter = self.service.reporter_service.make_reporter(self.meta);
            Ok(self
                .track_response(reporter, response, orig_parts, elapsed)
                .await?)
        } else {
            Ok(body::map_response_body(
                Self::transform_response_parts(response)?,
                body::wrapped,
            ))
        }
    }

    fn transform_response_parts(
        response: Response<body::Internal>,
    ) -> Result<Response<body::Internal>> {
        // generate appropriate headers for our response
        let new_headers = headers::response_headers(&response)?;

        let (mut parts, body) = response.into_parts();

        // set the headers
        parts.headers = new_headers;

        Ok(Response::from_parts(parts, body))
    }

    #[instrument(level = "info", skip_all)]
    async fn track_response(
        &mut self,
        mut reporter: Box<dyn EventReporter>,
        response: Response<body::Internal>,
        orig_parts: http::response::Parts,
        elapsed: TimeDelta,
    ) -> Result<Response<body::Internal>> {
        let (parts, orig_body) = response.into_parts();
        let (found_body_data, prefetched) = body::collect_ready_data(orig_body).await?;
        debug!("track_response found: {:?}", found_body_data);

        let event = Event::from_response(orig_parts, found_body_data, elapsed);
        reporter.send_event(body::Direction::Response, event)?;

        let downstream_body = self
            .tracked_body(prefetched, reporter, body::Direction::Response)
            .await?;

        Ok(Response::from_parts(parts, downstream_body))
    }

    async fn tracked_body(
        &mut self,
        prefetched: body::PrefetchedParts,
        reporter: Box<dyn EventReporter>,
        direction: body::Direction,
    ) -> Result<body::Internal> {
        let read_bytes: usize = prefetched.data_bytes();

        prefetched.assemble(|rest| {
            let (collector, mut data_reporter) =
                reporting::create_buffered(reporter, direction, read_bytes);
            {
                let mut tasks = self.service.tasks.lock().unwrap();
                spawn_instrumented_on(
                    &mut tasks,
                    &format!("track {} ({})", direction, self.conn.client),
                    async move {
                        let res = data_reporter.run().await;
                        debug!("reporter exiting");
                        res
                    },
                )?;
            }
            debug!("started reporter");
            Ok(body::BodyStreamWrapper::new(direction, rest, collector))
        })
    }
}

fn clone_request_parts<B>(request: http::Request<B>) -> (http::Request<B>, http::request::Parts) {
    let (parts, body) = request.into_parts();
    let cloned = parts.clone();
    (Request::from_parts(parts, body), cloned)
}

fn clone_response_parts<B>(
    response: http::Response<B>,
) -> (http::Response<B>, http::response::Parts) {
    let (parts, body) = response.into_parts();
    let cloned = parts.clone();
    (Response::from_parts(parts, body), cloned)
}
