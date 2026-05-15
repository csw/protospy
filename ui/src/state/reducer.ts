import type { BodyChunk } from "@bindings/BodyChunk";
import type { EventMessage } from "@bindings/EventMessage";
import type { InitialBody } from "@bindings/InitialBody";
import type { ProxyHeaders } from "@bindings/ProxyHeaders";

export interface BodyState {
  chunks: BodyChunk[];
  atEnd: boolean;
  totalBytes: number;
  contentEncoding?: string;
  contentType?: string;
}

export interface Exchange {
  id: number;
  timestamp: string;
  // Request fields
  method?: string;
  uri?: string;
  version?: string;
  requestHeaders?: ProxyHeaders;
  requestBody?: BodyState;
  // Response fields
  status?: string;
  responseVersion?: string;
  responseHeaders?: ProxyHeaders;
  elapsedMs?: number;
  responseBody?: BodyState;
  // Error
  error?: { direction: "Request" | "Response"; message: string };
  // Trace
  traceId?: string;
}

function getHeader(headers: ProxyHeaders, name: string): string | undefined {
  return headers.find((h) => h.name.toLowerCase() === name.toLowerCase())
    ?.value;
}

function initialBodyToState(
  body: InitialBody,
  headers: ProxyHeaders,
): BodyState | undefined {
  if (body.type === "NoBody") {
    return undefined;
  }
  const contentType = getHeader(headers, "content-type");
  const contentEncoding = getHeader(headers, "content-encoding");
  if (body.type === "NotRead") {
    return {
      chunks: [],
      atEnd: false,
      totalBytes: 0,
      contentType,
      contentEncoding,
    };
  }
  // "Data"
  const chunks: BodyChunk[] =
    body.content?.payload != null ? [body.content.payload] : [];
  return {
    chunks,
    atEnd: body.at_end,
    totalBytes: body.total_bytes,
    contentType,
    contentEncoding,
  };
}

function getOrCreate(
  exchanges: Map<number, Exchange>,
  ids: number[],
  id: number,
  timestamp: string,
): Exchange {
  let ex = exchanges.get(id);
  if (ex == null) {
    ex = { id, timestamp };
    exchanges.set(id, ex);
    ids.push(id);
  }
  return ex;
}

export function apply(
  exchanges: Map<number, Exchange>,
  ids: number[],
  msg: EventMessage,
): void {
  const { exchange: meta, event } = msg;
  const id = meta.exchange_id;
  const timestamp = meta.timestamp;

  if (event.type === "Request") {
    const ex = getOrCreate(exchanges, ids, id, timestamp);
    ex.method = event.method;
    ex.uri = event.uri;
    ex.version = event.version;
    ex.requestHeaders = event.headers;
    ex.requestBody = initialBodyToState(event.body, event.headers);
    const tp = getHeader(event.headers, "traceparent");
    if (tp) {
      const parts = tp.split("-");
      if (parts.length >= 2) {
        ex.traceId = parts[1];
      }
    }
  } else if (event.type === "Response") {
    const ex = getOrCreate(exchanges, ids, id, timestamp);
    ex.status = event.status;
    ex.responseVersion = event.version;
    ex.responseHeaders = event.headers;
    ex.elapsedMs = event.elapsed_ms;
    ex.responseBody = initialBodyToState(event.body, event.headers);
  } else if (event.type === "BodyData") {
    const ex = getOrCreate(exchanges, ids, id, timestamp);
    const direction = msg.direction;
    if (direction === "Request") {
      if (ex.requestBody == null) {
        ex.requestBody = { chunks: [], atEnd: false, totalBytes: 0 };
      }
      if (event.content?.payload != null) {
        ex.requestBody.chunks.push(event.content.payload);
      }
      ex.requestBody.atEnd = event.at_end;
      ex.requestBody.totalBytes = event.total_bytes;
    } else {
      if (ex.responseBody == null) {
        ex.responseBody = { chunks: [], atEnd: false, totalBytes: 0 };
      }
      if (event.content?.payload != null) {
        ex.responseBody.chunks.push(event.content.payload);
      }
      ex.responseBody.atEnd = event.at_end;
      ex.responseBody.totalBytes = event.total_bytes;
    }
  } else if (event.type === "Error") {
    const ex = getOrCreate(exchanges, ids, id, timestamp);
    ex.error = { direction: event.direction, message: event.message };
  }
}
