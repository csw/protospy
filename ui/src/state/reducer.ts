import type { BodyChunk } from "@bindings/BodyChunk";
import type { EventMessage } from "@bindings/EventMessage";
import type { InitialBody } from "@bindings/InitialBody";
import type { ProxyHeaders } from "@bindings/ProxyHeaders";
import type { SSEStreamState } from "@ui/body/sse-stream";
import {
  createSSEStreamState,
  feedChunk,
  chunkToText,
  applyRetention,
} from "@ui/body/sse-stream";

export interface BodyState {
  chunks: BodyChunk[];
  atEnd: boolean;
  /**
   * Wire byte count, as reported by the Rust backend's
   * `BodyData.total_bytes`. For uncompressed bodies this equals the
   * decoded byte count; for `Content-Encoding: gzip | deflate | br | zstd`
   * bodies it is the compressed size on the wire. The decompressed byte
   * count is computed by the decode pipeline and surfaced separately as
   * `DecodeResult.decodedBytes` (see body/decode.ts).
   */
  wireBytes: number;
  /**
   * Decompressed byte count. Populated by the body decode pipeline (see
   * `body/decode.ts` and `hooks/useDecodeBody.ts`) once a body has been
   * decoded — it is undefined until then, and for uncompressed bodies is
   * equal to `wireBytes` once known. Surfaces that show sizes outside the
   * body pane (timing view, exchange list) read this lazily; they fall
   * back to `wireBytes` alone when the body has not yet been decoded.
   */
  decodedBytes?: number;
  contentEncoding?: string;
  contentType?: string;
  /**
   * Incrementally-parsed SSE stream state. Present only for
   * `text/event-stream` bodies. When set, `chunks` is kept empty — parsed
   * events are the canonical representation (no double-storage). `wireBytes`
   * still tracks the wire size.
   */
  sseState?: SSEStreamState;
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

function isSSEContentType(ct: string | undefined): boolean {
  return ct?.toLowerCase().startsWith("text/event-stream") ?? false;
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
      wireBytes: 0,
      contentType,
      contentEncoding,
      sseState: isSSEContentType(contentType)
        ? createSSEStreamState()
        : undefined,
    };
  }
  // "Data" — for SSE bodies, parse the initial chunk into sseState and keep
  // chunks empty (parsed events are the canonical representation).
  if (isSSEContentType(contentType)) {
    let sseState = createSSEStreamState();
    if (body.content?.payload != null) {
      sseState = feedChunk(sseState, chunkToText(body.content.payload));
      sseState = applyRetention(sseState);
    }
    return {
      chunks: [],
      atEnd: body.at_end,
      wireBytes: body.total_bytes,
      contentType,
      contentEncoding,
      sseState,
    };
  }
  const chunks: BodyChunk[] =
    body.content?.payload != null ? [body.content.payload] : [];
  return {
    chunks,
    atEnd: body.at_end,
    wireBytes: body.total_bytes,
    contentType,
    contentEncoding,
  };
}

/**
 * Append a `BodyData` chunk immutably, returning a NEW `BodyState` with a new
 * `chunks` array (when a payload is present). The previous body — if any — is
 * the base; otherwise a fresh empty body is seeded.
 *
 * For SSE bodies (`sseState` present), the chunk is parsed incrementally into
 * the SSE stream state and `chunks` stays empty.
 */
function appendBodyData(
  prev: BodyState | undefined,
  event: Extract<EventMessage["event"], { type: "BodyData" }>,
): BodyState {
  const base: BodyState = prev ?? { chunks: [], atEnd: false, wireBytes: 0 };

  // SSE path: parse the chunk incrementally; don't accumulate raw bytes.
  if (base.sseState != null) {
    let sseState = base.sseState;
    if (event.content?.payload != null) {
      sseState = feedChunk(sseState, chunkToText(event.content.payload));
      sseState = applyRetention(sseState);
    }
    return {
      ...base,
      sseState,
      atEnd: event.at_end,
      wireBytes: event.total_bytes,
    };
  }

  // Non-SSE path: accumulate raw chunks.
  const chunks =
    event.content?.payload != null
      ? [...base.chunks, event.content.payload]
      : base.chunks;
  return {
    ...base,
    chunks,
    atEnd: event.at_end,
    wireBytes: event.total_bytes,
  };
}

/**
 * Pure, immutable reducer. Each call produces a NEW `Exchange` (and, where the
 * event touches a body, a NEW `BodyState`) rather than mutating the existing
 * objects in place. Object identity therefore tracks change consistently with
 * the store's `setBodyDecodedBytes` action: any identity-based memoization
 * (e.g. `React.memo` keyed on a single `Exchange`/`BodyState`) sees streaming
 * updates instead of silently missing them.
 *
 * The `exchanges` Map and `ids` array are still mutated in place — the store's
 * `applyEvent` action passes in fresh copies it owns, so this is the
 * copy-on-write target, not shared state.
 */
export function apply(
  exchanges: Map<number, Exchange>,
  ids: number[],
  msg: EventMessage,
): void {
  const { exchange: meta, event } = msg;
  const id = meta.exchange_id;
  const timestamp = meta.timestamp;

  const prev = exchanges.get(id);
  // Shallow-copy the prior exchange (or seed a fresh one) so the stored object
  // is always a new identity after a matched event.
  const ex: Exchange = prev == null ? { id, timestamp } : { ...prev };

  if (event.type === "Request") {
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
    ex.status = event.status;
    ex.responseVersion = event.version;
    ex.responseHeaders = event.headers;
    ex.elapsedMs = event.elapsed_ms;
    ex.responseBody = initialBodyToState(event.body, event.headers);
  } else if (event.type === "BodyData") {
    if (msg.direction === "Request") {
      ex.requestBody = appendBodyData(ex.requestBody, event);
    } else {
      ex.responseBody = appendBodyData(ex.responseBody, event);
    }
  } else if (event.type === "Error") {
    ex.error = { direction: event.direction, message: event.message };
  } else {
    // Unknown event type — leave the Map and ids untouched, matching the
    // prior behavior where unmatched events created no exchange.
    return;
  }

  if (prev == null) {
    ids.push(id);
  }
  exchanges.set(id, ex);
}
