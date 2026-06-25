import type { BodyChunk } from "@bindings/BodyChunk";
import type { EventMessage } from "@bindings/EventMessage";
import type { InitialBody } from "@bindings/InitialBody";
import type { ProxyHeaders } from "@bindings/ProxyHeaders";
import {
  createSSEStreamState,
  feedChunk,
  chunkToText,
  applyRetention,
} from "@ui/body/sse-stream";
import type { BodyState, Exchange } from "@ui/state/types";

/**
 * Hard cap on the number of exchanges retained in the store. Beyond this,
 * oldest-first FIFO eviction (see {@link evict}) drops the least-recent
 * exchanges so a long session can't grow the store unboundedly (PRO-97).
 */
export const MAX_EXCHANGES = 1024;

/**
 * Hard cap on total retained body payload, in bytes (512 MB). Accounted from
 * each body's wire size (`BodyState.wireBytes`) — the bytes the store actually
 * holds long-term as `chunks` — which is a close-enough guardrail without exact
 * byte-level accounting. The decompressed copy is produced on demand and held
 * only while an exchange is selected, so it is intentionally not counted.
 */
export const MAX_PAYLOAD_BYTES = 512 * 1024 * 1024;

function getHeader(headers: ProxyHeaders, name: string): string | undefined {
  return headers.find((h) => h.name.toLowerCase() === name.toLowerCase())
    ?.value;
}

/** Retained wire-byte footprint of one exchange (request + response bodies). */
function exchangeBytes(ex: Exchange): number {
  return (ex.requestBody?.wireBytes ?? 0) + (ex.responseBody?.wireBytes ?? 0);
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
    ex.error = {
      kind: "generic",
      direction: event.direction,
      message: event.message,
    };
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

/**
 * Oldest-first FIFO eviction to keep the store within its hard caps
 * ({@link MAX_EXCHANGES} and {@link MAX_PAYLOAD_BYTES}). Mutates `exchanges` and
 * `ids` in place, exactly like {@link apply} — the store's `applyEvent` passes
 * in the fresh copies it owns. Runs after every applied event because a body's
 * `wireBytes` grows as streaming `BodyData` events arrive, so the payload cap
 * can be crossed without a new exchange being added.
 *
 * `protectedId` (the currently selected exchange) is never evicted, so a user
 * inspecting an old exchange doesn't have it vanish mid-view. At most one id is
 * protected, so the count cap is still always reachable. The store is never
 * emptied: eviction stops once a single exchange remains, so a lone exchange
 * whose body alone exceeds the payload cap is retained rather than dropped.
 */
export function evict(
  exchanges: Map<number, Exchange>,
  ids: number[],
  protectedId?: number | null,
): void {
  // Index of the oldest evictable (non-protected) id, or -1 if none.
  const oldestEvictable = (): number =>
    ids.findIndex((id) => id !== protectedId);

  // Count cap: drop oldest non-protected exchanges down to MAX_EXCHANGES.
  while (ids.length > MAX_EXCHANGES) {
    const i = oldestEvictable();
    if (i === -1) break;
    exchanges.delete(ids[i]);
    ids.splice(i, 1);
  }

  // Payload cap: drop oldest non-protected exchanges until total wire bytes are
  // within MAX_PAYLOAD_BYTES, always keeping at least one exchange.
  let total = 0;
  for (const id of ids) {
    const ex = exchanges.get(id);
    if (ex != null) total += exchangeBytes(ex);
  }
  while (total > MAX_PAYLOAD_BYTES && ids.length > 1) {
    const i = oldestEvictable();
    if (i === -1) break;
    const ex = exchanges.get(ids[i]);
    if (ex != null) total -= exchangeBytes(ex);
    exchanges.delete(ids[i]);
    ids.splice(i, 1);
  }
}
