type Msg = Record<string, unknown>;

function meta(id: number, ts = "2024-01-01T00:00:00Z") {
  return { exchange_id: id, timestamp: ts };
}

const JSON_CT = [{ name: "Content-Type", value: "application/json" }];

export function makeGetRequest(
  id: number,
  uri = "/api/test",
  ts?: string,
  headers?: Array<{ name: string; value: string }>,
): Msg {
  return {
    exchange: meta(id, ts),
    direction: "Request",
    event: {
      type: "Request",
      method: "GET",
      uri,
      version: "HTTP/1.1",
      headers: headers ?? JSON_CT,
      body: { type: "NoBody" },
    },
  };
}

export function makePostRequest(
  id: number,
  uri = "/api/data",
  body = '{"key":"value"}',
  ts?: string,
): Msg {
  return {
    exchange: meta(id, ts),
    direction: "Request",
    event: {
      type: "Request",
      method: "POST",
      uri,
      version: "HTTP/1.1",
      headers: JSON_CT,
      body: {
        type: "Data",
        content: {
          offset: 0,
          length: body.length,
          payload: { text: body },
        },
        trailers: null,
        at_end: true,
        total_bytes: body.length,
      },
    },
  };
}

export function makeResponse(
  id: number,
  status: string,
  body?: string,
  ts?: string,
  headers?: Array<{ name: string; value: string }>,
): Msg {
  const hdrs = headers ?? JSON_CT;
  return {
    exchange: meta(id, ts),
    direction: "Response",
    event: {
      type: "Response",
      status,
      version: "HTTP/1.1",
      headers: hdrs,
      elapsed_ms: 42,
      body: body
        ? {
            type: "Data",
            content: {
              offset: 0,
              length: body.length,
              payload: { text: body },
            },
            trailers: null,
            at_end: true,
            total_bytes: body.length,
          }
        : { type: "NoBody" },
    },
  };
}

export function makeRequestWithTrace(
  id: number,
  traceId: string,
  uri = "/api/traced",
  ts?: string,
): Msg {
  return {
    exchange: meta(id, ts),
    direction: "Request",
    event: {
      type: "Request",
      method: "GET",
      uri,
      version: "HTTP/1.1",
      headers: [
        ...JSON_CT,
        {
          name: "traceparent",
          value: `00-${traceId}-0000000000000001-01`,
        },
      ],
      body: { type: "NoBody" },
    },
  };
}

export function makeSSEResponse(id: number, body: string, ts?: string): Msg {
  return {
    exchange: meta(id, ts),
    direction: "Response",
    event: {
      type: "Response",
      status: "200 OK",
      version: "HTTP/1.1",
      headers: [{ name: "Content-Type", value: "text/event-stream" }],
      elapsed_ms: 100,
      body: {
        type: "Data",
        content: {
          offset: 0,
          length: body.length,
          payload: { text: body },
        },
        trailers: null,
        at_end: true,
        total_bytes: body.length,
      },
    },
  };
}

export function makeMsearchRequest(id: number, ts?: string): Msg {
  return makePostRequest(id, "/_msearch", '{"index":"test"}\n{}\n', ts);
}

export function makeBinaryResponse(
  id: number,
  base64: string,
  totalBytes: number,
  ts?: string,
): Msg {
  return {
    exchange: meta(id, ts),
    direction: "Response",
    event: {
      type: "Response",
      status: "200 OK",
      version: "HTTP/1.1",
      headers: [{ name: "Content-Type", value: "application/octet-stream" }],
      elapsed_ms: 12,
      body: {
        type: "Data",
        content: {
          offset: 0,
          length: totalBytes,
          payload: { binary: base64 },
        },
        trailers: null,
        at_end: true,
        total_bytes: totalBytes,
      },
    },
  };
}

export function makeGzipJsonResponse(
  id: number,
  gzippedBase64: string,
  totalBytes: number,
  ts?: string,
): Msg {
  return {
    exchange: meta(id, ts),
    direction: "Response",
    event: {
      type: "Response",
      status: "200 OK",
      version: "HTTP/1.1",
      headers: [
        { name: "Content-Type", value: "application/json" },
        { name: "Content-Encoding", value: "gzip" },
      ],
      elapsed_ms: 12,
      body: {
        type: "Data",
        content: {
          offset: 0,
          length: totalBytes,
          payload: { binary: gzippedBase64 },
        },
        trailers: null,
        at_end: true,
        total_bytes: totalBytes,
      },
    },
  };
}

export function makeDeleteRequest(
  id: number,
  uri = "/api/resource/1",
  ts?: string,
): Msg {
  return {
    exchange: meta(id, ts),
    direction: "Request",
    event: {
      type: "Request",
      method: "DELETE",
      uri,
      version: "HTTP/1.1",
      headers: [],
      body: { type: "NoBody" },
    },
  };
}

export function makePutRequest(
  id: number,
  uri = "/api/resource/1",
  ts?: string,
): Msg {
  return {
    exchange: meta(id, ts),
    direction: "Request",
    event: {
      type: "Request",
      method: "PUT",
      uri,
      version: "HTTP/1.1",
      headers: JSON_CT,
      body: {
        type: "Data",
        content: {
          offset: 0,
          length: 2,
          payload: { text: "{}" },
        },
        trailers: null,
        at_end: true,
        total_bytes: 2,
      },
    },
  };
}

export function makeCompleteExchange(
  id: number,
  method: string,
  uri: string,
  status: string,
  opts?: {
    ts?: string;
    traceId?: string;
    responseBody?: string;
    elapsed?: number;
  },
): Msg[] {
  const ts = opts?.ts ?? "2024-01-01T00:00:00Z";
  const reqHeaders = [...JSON_CT];
  if (opts?.traceId) {
    reqHeaders.push({
      name: "traceparent",
      value: `00-${opts.traceId}-0000000000000001-01`,
    });
  }

  const req: Msg = {
    exchange: meta(id, ts),
    direction: "Request",
    event: {
      type: "Request",
      method,
      uri,
      version: "HTTP/1.1",
      headers: reqHeaders,
      body: { type: "NoBody" },
    },
  };

  const res = makeResponse(id, status, opts?.responseBody, ts);
  if (opts?.elapsed != null) {
    (res.event as Record<string, unknown>).elapsed_ms = opts.elapsed;
  }

  return [req, res];
}
