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
  elapsedMs = 42,
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
      elapsed_ms: elapsedMs,
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

export function makeSSEResponse(
  id: number,
  body: string,
  ts?: string,
  atEnd = true,
): Msg {
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
        at_end: atEnd,
        total_bytes: body.length,
      },
    },
  };
}

/**
 * A `BodyData` event for an SSE stream — sends a text chunk as a streaming
 * update. Pair with a preceding `makeSSEResponse` (with `atEnd: false`) to
 * model an incrementally-arriving SSE body.
 */
export function makeSSEBodyData(
  id: number,
  text: string,
  atEnd: boolean,
  totalBytes: number,
  ts?: string,
): Msg {
  return {
    exchange: meta(id, ts),
    direction: "Response",
    event: {
      type: "BodyData",
      content: {
        offset: 0,
        length: text.length,
        payload: { text },
      },
      trailers: null,
      at_end: atEnd,
      total_bytes: totalBytes,
    },
  };
}

export function makeMsearchRequest(id: number, ts?: string): Msg {
  return makePostRequest(id, "/_msearch", '{"index":"test"}\n{}\n', ts);
}

/** text/plain response. Used by the body-text scene. */
export function makeTextResponse(
  id: number,
  body = "OK\nService is healthy.\nVersion: 1.4.2",
  ts?: string,
): Msg {
  return makeResponse(id, "200 OK", body, ts, [
    { name: "Content-Type", value: "text/plain; charset=utf-8" },
  ]);
}

/**
 * application/x-ndjson response with several JSON lines. Renders as a forest of
 * independently-collapsible document trees (PRO-400).
 */
export function makeNDJsonResponse(id: number, ts?: string): Msg {
  const lines = [
    '{"id":1,"event":"login","user":"alice","ts":"2024-01-01T00:00:01Z"}',
    '{"id":2,"event":"view","user":"alice","path":"/dashboard","ts":"2024-01-01T00:00:02Z"}',
    '{"id":3,"event":"click","user":"alice","target":"btn-export","ts":"2024-01-01T00:00:04Z"}',
    '{"id":4,"event":"logout","user":"alice","ts":"2024-01-01T00:00:08Z"}',
  ].join("\n");
  return makeResponse(id, "200 OK", lines, ts, [
    { name: "Content-Type", value: "application/x-ndjson" },
  ]);
}

/**
 * application/json response whose body was truncated mid-structure (a size cap
 * or interrupted capture). The viewer recovers the valid prefix with
 * best-effort-json-parser and shows the truncation banner + in-tree cut-point
 * marker (PRO-400).
 */
export function makeTruncatedJsonResponse(id: number, ts?: string): Msg {
  const truncated =
    '{"took":5,"timed_out":false,"hits":{"total":{"value":3},' +
    '"hits":[{"_id":"1","_source":{"name":"alpha","tags":["a","b"]}},' +
    '{"_id":"2","_source":{"name":"be';
  return makeResponse(id, "200 OK", truncated, ts, [
    { name: "Content-Type", value: "application/json" },
  ]);
}

/**
 * application/x-ndjson response whose final line was truncated mid-structure (a
 * size cap or interrupted capture). The leading lines parse strictly; the viewer
 * recovers the valid prefix of the last line with best-effort-json-parser and
 * shows the truncation banner + in-tree cut-point marker on the final document
 * (PRO-400).
 */
export function makeTruncatedNdjsonResponse(id: number, ts?: string): Msg {
  const lines = [
    '{"id":1,"event":"login","user":"alice"}',
    '{"id":2,"event":"view","user":"alice","path":"/dashboard"}',
    '{"id":3,"event":"click","user":"alice","target":"btn-ex',
  ].join("\n");
  return makeResponse(id, "200 OK", lines, ts, [
    { name: "Content-Type", value: "application/x-ndjson" },
  ]);
}

export function makeBinaryResponse(
  id: number,
  base64: string,
  wireBytes: number,
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
          length: wireBytes,
          payload: { binary: base64 },
        },
        trailers: null,
        at_end: true,
        total_bytes: wireBytes,
      },
    },
  };
}

/**
 * An `image/*` response carrying binary chunk data. Drives the image content
 * kind: the `rendered` summary view (until PRO-412) and copy-as-image-data
 * (PRO-420). Content-type defaults to `image/png`.
 */
export function makeImageResponse(
  id: number,
  base64: string,
  wireBytes: number,
  contentType = "image/png",
  ts?: string,
): Msg {
  return {
    exchange: meta(id, ts),
    direction: "Response",
    event: {
      type: "Response",
      status: "200 OK",
      version: "HTTP/1.1",
      headers: [{ name: "Content-Type", value: contentType }],
      elapsed_ms: 12,
      body: {
        type: "Data",
        content: {
          offset: 0,
          length: wireBytes,
          payload: { binary: base64 },
        },
        trailers: null,
        at_end: true,
        total_bytes: wireBytes,
      },
    },
  };
}

export function makeGzipJsonResponse(
  id: number,
  gzippedBase64: string,
  wireBytes: number,
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
          length: wireBytes,
          payload: { binary: gzippedBase64 },
        },
        trailers: null,
        at_end: true,
        total_bytes: wireBytes,
      },
    },
  };
}

/**
 * Generic compressed-JSON response fixture. Pass the base64-encoded
 * compressed body and the Content-Encoding value (e.g. "gzip", "deflate",
 * "br"). Used by browser/body-compressed.spec.ts; add "zstd" here when
 * PRO-207 (zstd decompression) lands.
 */
export function makeEncodedJsonResponse(
  id: number,
  encodedBase64: string,
  wireBytes: number,
  contentEncoding: string,
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
        { name: "Content-Encoding", value: contentEncoding },
      ],
      elapsed_ms: 12,
      body: {
        type: "Data",
        content: {
          offset: 0,
          length: wireBytes,
          payload: { binary: encodedBase64 },
        },
        trailers: null,
        at_end: true,
        total_bytes: wireBytes,
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

/**
 * Proxy-level error event. The Rust backend emits these when the upstream
 * connection fails (connection refused, DNS failure, idle/read timeout,
 * mid-stream disconnect, etc.) — the message is whatever string the
 * backend derives from hyper's error chain. `direction` indicates which
 * side of the proxy the failure occurred on:
 *   - "Request"  — failed while connecting/sending to upstream (no
 *                  response was ever produced)
 *   - "Response" — upstream accepted the request but the response failed
 *                  (e.g. mid-stream disconnect after headers)
 *
 * Pair this with a Request event sharing the same exchange_id to model
 * the realistic shape of an error exchange. See PRO-217.
 */
export function makeProxyError(
  id: number,
  direction: "Request" | "Response",
  message: string,
  ts?: string,
): Msg {
  return {
    exchange: meta(id, ts),
    direction,
    event: {
      type: "Error",
      direction,
      message,
    },
  };
}

/**
 * A deliberately long URI: deep path plus a long query string. Exercises
 * truncation / clipping affordances in the exchange list and context bar.
 * Both `path` and `query` overflow their containers at every supported width.
 */
export const LONG_URI =
  "/api/v2/organizations/acme-corporation/workspaces/production-east-1/" +
  "projects/customer-analytics-pipeline/datasets/clickstream-events-2024/" +
  "records?filter=status%3Aactive%20AND%20region%3Aus-east-1%20AND%20" +
  "created_at%3E2024-01-01&sort=-updated_at,name&fields=id,name,status," +
  "owner,created_at,updated_at,tags&page=7&page_size=100&include=metadata," +
  "permissions,audit_log&expand=owner.team,project.workspace";

// NOTE: there is intentionally no "long status" fixture. HTTP status phrases
// are short by design — real traffic is overwhelmingly 200/302/400/404/500/502,
// and even exotic codes (507, 511) carry short reason phrases. Fabricating a
// 100-character reason phrase to stress the status column tests a state that
// never occurs in practice. If status-display truncation needs coverage, drive
// it with realistic content (e.g. a normal three-digit code clipping when the
// column is made very narrow), not an invented long phrase. (PRO-250)

/** A verbose proxy error message (mirrors a deep hyper error chain). */
export const LONG_ERROR_MESSAGE =
  "error sending request for url (https://upstream.internal.example.com:8443/" +
  "v1/ingest): connection error: connection reset by peer (os error 104); " +
  "after 3 retries over 12.4s; last upstream resolved to 10.4.21.7:8443 via " +
  "service discovery record ingest.prod.svc.cluster.local";

/**
 * Pre-computed gzip of
 *   {"items":[{"id":1,"name":"alpha"},{"id":2,"name":"beta"}]}
 * (66 wire bytes → 58 decoded bytes). Shared with browser/body-gzip.spec.ts's
 * inline constant; kept here so the dual wire/decoded size cell can show a
 * label whose two numbers differ and whose body still decodes cleanly when
 * the inspector opens it.
 */
export const GZIP_JSON_BASE64 =
  "H4sIAAAAAAAAE6tWyixJzS1WsoquVspMUbIy1FHKS8xNVbJSSswpyEhUqtWBiBvBxZNSSxKVamNrAXGp+bs6AAAA";
export const GZIP_JSON_WIRE_BYTES = 66;
export const GZIP_JSON_DECODED_BYTES = 58;

/**
 * Gzip-compressed JSON response used by the dual wire/decoded size cell.
 * Pair with a `setBodyDecodedBytes(id, "response", GZIP_JSON_DECODED_BYTES)`
 * call to surface the `wire/decoded` label in the list before the body pane
 * runs the decode pipeline itself.
 */
export function makeDualSizeResponse(id: number, ts?: string): Msg {
  return makeGzipJsonResponse(id, GZIP_JSON_BASE64, GZIP_JSON_WIRE_BYTES, ts);
}

/** Request whose URI overflows: long path + long query string. */
export function makeLongUriRequest(
  id: number,
  uri = LONG_URI,
  ts?: string,
): Msg {
  return makeGetRequest(id, uri, ts);
}

/**
 * Generate `count` complete exchanges (request + response) for the
 * many-rows / virtualization cell. Methods, statuses, paths, and elapsed
 * times rotate deterministically so the list looks realistic without any
 * randomness (timestamps are fixed). Returns a flat `Msg[]` ready to inject.
 */
export function makeManyExchanges(count: number, startId = 1): Msg[] {
  const methods = ["GET", "POST", "PUT", "DELETE", "PATCH"];
  const statuses = [
    "200 OK",
    "201 Created",
    "304 Not Modified",
    "404 Not Found",
    "500 Internal Server Error",
  ];
  const paths = [
    "/api/users",
    "/api/orders/recent",
    "/api/products/search",
    "/_search",
    "/api/sessions/refresh",
  ];
  const msgs: Msg[] = [];
  for (let i = 0; i < count; i++) {
    const id = startId + i;
    msgs.push(
      ...makeCompleteExchange(
        id,
        methods[i % methods.length],
        `${paths[i % paths.length]}/${id}`,
        statuses[i % statuses.length],
        { elapsed: 8 + ((i * 37) % 1200) },
      ),
    );
  }
  return msgs;
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
