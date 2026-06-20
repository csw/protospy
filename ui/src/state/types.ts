import type { BodyChunk } from "@bindings/BodyChunk";
import type { ProxyHeaders } from "@bindings/ProxyHeaders";
import type { SSEStreamState } from "@ui/body/sse-stream";

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

/**
 * Exchange-level transport/network failure — the *cause* of a failed exchange
 * (upstream unreachable, TLS, timeout, connection reset). Distinct from an HTTP
 * error response: a transport failure populates `error` while `status` stays
 * absent; a 5xx populates `status` with no `error`. The whole
 * network-error-vs-HTTP-error rule keys off `error != null` (design-system hard
 * rule 4).
 *
 * Typed with a single generic variant today (PRO-346). `kind` is the discriminant
 * for *additive* extension: as the proxy exposes more of its `Cause`
 * classification (`src/proxy/hyper_errors.rs`), new variants are added here
 * without re-laying this boundary. `direction` — the proxy's authoritative
 * statement of which leg failed — and `message` are preserved from the proxy's
 * `Error` event (`direction` is the only direction signal when the failing side
 * has no body to mark truncated, e.g. a network error before the response
 * begins).
 */
export interface ExchangeError {
  kind: "generic";
  direction: "Request" | "Response";
  message: string;
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
  // Error — transport-failure cause, distinct from a 5xx HTTP response
  error?: ExchangeError;
  // Trace
  traceId?: string;
}
