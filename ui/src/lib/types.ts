// src/lib/types.ts — protospy domain model.
// The internal entity is an Exchange (request + response). The user-facing
// noun is "Request" — keep component/type names on Exchange, surface "Request".

export type HttpMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "HEAD"
  | "OPTIONS";

export type ConnectionStatus = "open" | "connecting" | "down";

/** What an exchange *is*, beyond a plain HTTP call. Drives which inspector view renders. */
export type ExchangeProtocol = "http" | "sse" | "msearch";

export interface Header {
  name: string;
  value: string;
}

/**
 * Body panes are lifecycle-aware, never a flat "pending":
 *  - awaiting   → no status/headers yet
 *  - streaming  → response started, body still arriving (partial available)
 *  - complete   → full body decoded
 * Use symmetrically for the request side.
 */
export type BodyState =
  | { phase: "awaiting" }
  | { phase: "streaming"; partial: string }
  | { phase: "complete"; text: string };

export interface MessageSide {
  headers: Header[];
  mediaType: string | null; // full media type; UI shows an abbreviated slug + tooltip
  wireBytes: number; // bytes on the wire (post-compression)
  decodedBytes: number | null; // decoded size when content-encoding present
  encoding: string | null; // gzip | br | zstd | …
  body: BodyState;
}

/** A transport/network failure: upstream unreachable, TLS error, timeout, reset.
 *  DISTINCT from an HTTP error response (a 5xx that came back). */
export interface TransportError {
  kind: string; // e.g. "ECONNRESET", "ETIMEDOUT", "TLS"
  message: string;
}

export interface Exchange {
  id: number;
  method: HttpMethod;
  uri: string; // full path including query string
  startedAt: number; // epoch ms (render absolute, ms precision)
  status: number | null; // null while pending or on transport error
  elapsedMs: number | null;
  traceId: string | null; // parsed from traceparent (or configured header)
  protocol: ExchangeProtocol;
  request: MessageSide;
  response: MessageSide | null; // null until the response begins
  error: TransportError | null; // present ⇒ render the network-error treatment
  /** sub-request count for msearch/mget bundles, else undefined */
  bundleCount?: number;
}

export type StatusKind =
  | "ok"
  | "redirect"
  | "client"
  | "server"
  | "pending"
  | "error";

/** A single SSE event within a streaming exchange. */
export interface StreamEvent {
  seq: number;
  offsetMs: number; // relative to stream start
  type: string; // provider event name (message_start, content_block_delta, …)
  data: unknown; // parsed `data:` payload
}
