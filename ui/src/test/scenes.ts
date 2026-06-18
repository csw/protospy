// Fixture matrix (PRO-234).
//
// A *scene* is a deterministic, injectable UI state — one cell of the
// state + data-size review matrix. Each scene bundles the `EventMessage`s to
// inject plus the store configuration (selection, connection, view mode,
// density, decoded-size caches) needed to reach that cell.
//
// Two consumers share these definitions:
//   1. The browser test suite (`browser/fixture-matrix.spec.ts` and friends),
//      which imports `SCENES` / `applySceneToStore` directly.
//   2. The visual-review subagent (PRO-235), which drives a running dev server
//      and reaches each cell through the dev-only `window.__test_scenes`
//      harness installed by `installSceneHarness`.
//
// This module is intentionally free of any top-level `window` or store import
// so it stays node-safe: unit tests can import `SCENES` / `applySceneToStore`
// in the node Vitest project. `installSceneHarness` touches `window` only
// inside its body, and `AppStore` is a type-only import (erased at runtime).
//
// Axes covered (see docs/fixture-matrix.md for the full table):
//   - state: empty, loading, error row, mid-stream error, selected, hover,
//            SSE streams, body-pane terminal modes (awaiting, no-body, text,
//            binary, decode-failed)
//   - data:  long URI + query, long error, many rows, dual size, NDJSON,
//            truncated body
//   - view:  rows vs table, compact vs regular density, compact inspector,
//            headers tab, timing tab
//   - cross: view × data combinations (table/compact crossed with a data
//            extreme) that stress column-width allocation
//   - trace: traceparent grouping (colour bars, trace rail, trace filter chip)
// The list-pane min/wide axis is an interaction (separator drag), not store
// state — see `browser/helpers/scenes.ts` and the matrix doc.

import type { Page } from "@playwright/test";
import type { ConnectionStatus } from "@ui/api/sse";
import type { AppStore } from "@ui/state/store";
import type { ViewMode } from "@ui/body/view-modes";
import type { Protocol } from "@bindings/Protocol";
import {
  GZIP_JSON_DECODED_BYTES,
  LONG_ERROR_MESSAGE,
  LONG_URI,
  makeBinaryResponse,
  makeCompleteExchange,
  makeDualSizeResponse,
  makeEncodedJsonResponse,
  makeGetRequest,
  makeHtmlResponse,
  makeLongUriRequest,
  makeManyExchanges,
  makeNDJsonResponse,
  makeXmlResponse,
  makePostRequest,
  makeProxyError,
  makeResponse,
  makeSSEBodyData,
  makeSSEResponse,
  makeTextResponse,
  makeTruncatedJsonResponse,
  makeTruncatedNdjsonResponse,
} from "./fixtures";

type Msg = Record<string, unknown>;

/** The four desktop-only review widths (px). Below 1024 is unsupported. */
export const SUPPORTED_WIDTHS = [1024, 1280, 1440, 1920] as const;

export type SceneAxis = "state" | "data" | "view";

/** Declarative store configuration applied after a scene's messages inject. */
export interface SceneConfig {
  /** Connection status; defaults to "open" (green dot) when omitted. */
  connection?: ConnectionStatus;
  /**
   * Service name shown in the status bar. Normally left unset: setting a
   * service makes AppShell open a live SSE subscription, whose status callback
   * would override the scene's `connection`. Only set it when you also stub
   * `/service/<name>/events` and don't care about a deterministic connection.
   */
  service?: string | null;
  selectedId?: number | null;
  filter?: string;
  /**
   * Active trace filter (a 32-hex traceparent trace-id). Set it to drive the
   * `FilterBar` trace chip and narrow the list to one trace, mirroring a click
   * on a row's trace pill.
   */
  traceFilter?: string | null;
  listMode?: "rows" | "table";
  density?: "regular" | "compact";
  /** Sets the stored list width for a mode (drives the panel default at mount). */
  listWidth?: { mode: "rows" | "table"; width: number };
  /**
   * Decoded-byte caches to simulate a body that has already run through the
   * decode pipeline, so the list/timing surfaces show the dual wire/decoded
   * size label without the body pane being opened.
   */
  decoded?: Array<{
    id: number;
    direction: "request" | "response";
    bytes: number;
  }>;
  /** Protocol for SSE rendering (e.g. "Anthropic" for ChatStreamView). */
  protocol?: Protocol | null;
  /** Open the ⌘K command palette. */
  cmdKOpen?: boolean;
  /** Open the `?` keyboard-shortcuts overlay. */
  helpOpen?: boolean;
  /** Override the stored request-body view mode (null = kind default). */
  requestViewMode?: ViewMode | null;
  /** Override the stored response-body view mode (null = kind default). */
  responseViewMode?: ViewMode | null;
}

export interface Scene {
  /** Stable kebab-case identifier — the documented injection key. */
  id: string;
  /** Human-readable label. */
  title: string;
  axis: SceneAxis;
  /** What this cell demonstrates / what to look for. */
  description: string;
  /**
   * Playwright steps to reach the visual state this scene documents. Store
   * injection alone delivers the pre-interaction snapshot; calling `interact`
   * drives the page to the claimed state. Consumed by `scene-interactions.spec.ts`
   * and the bestiary runner — no LLM interpretation needed.
   */
  interact?: (page: Page) => Promise<void>;
  messages: Msg[];
  config?: SceneConfig;
}

// A small, realistic set of complete exchanges used as the backdrop for
// several scenes (selection, hover). Deterministic ids 1..4.
function backdrop(): Msg[] {
  return [
    ...makeCompleteExchange(1, "GET", "/api/users", "200 OK", { elapsed: 34 }),
    ...makeCompleteExchange(2, "POST", "/api/orders", "201 Created", {
      elapsed: 88,
    }),
    ...makeCompleteExchange(3, "GET", "/api/products/42", "404 Not Found", {
      elapsed: 12,
    }),
    ...makeCompleteExchange(
      4,
      "DELETE",
      "/api/sessions/abc",
      "500 Internal Server Error",
      {
        elapsed: 503,
      },
    ),
  ];
}

// Two distinct W3C `traceparent` trace-ids (the spec's canonical examples).
// They hash to different `traceColor()` palette entries, so a scene mixing
// them shows two visibly distinct trace rails / color bars.
const TRACE_A = "4bf92f3577b34da6a3ce929d0e0e4736";
const TRACE_B = "0af7651916cd43dd8448eb211c80319c";

// Heterogeneous traffic where some exchanges share a `traceparent` trace-id and
// others carry none. Trace A spans three hops (ids 1, 3, 5), trace B spans two
// (ids 4, 6), and ids 2 + 7 are untraced — so the list shows coloured trace
// bars, the trace rail, and (with a trace member selected) the context bar's
// "next in trace" jump. Deterministic ids 1..7.
function tracedTraffic(): Msg[] {
  return [
    ...makeCompleteExchange(1, "POST", "/api/checkout/cart", "200 OK", {
      traceId: TRACE_A,
      elapsed: 41,
    }),
    ...makeCompleteExchange(2, "GET", "/api/users", "200 OK", { elapsed: 28 }),
    ...makeCompleteExchange(3, "POST", "/api/checkout/payment", "201 Created", {
      traceId: TRACE_A,
      elapsed: 173,
    }),
    ...makeCompleteExchange(4, "GET", "/api/search?q=boots", "200 OK", {
      traceId: TRACE_B,
      elapsed: 64,
    }),
    ...makeCompleteExchange(5, "GET", "/api/checkout/confirm", "200 OK", {
      traceId: TRACE_A,
      elapsed: 52,
    }),
    ...makeCompleteExchange(6, "POST", "/api/search/refine", "200 OK", {
      traceId: TRACE_B,
      elapsed: 39,
    }),
    ...makeCompleteExchange(7, "GET", "/api/products/42", "404 Not Found", {
      elapsed: 12,
    }),
  ];
}

export const SCENES: Scene[] = [
  // ---- state axis ---------------------------------------------------------
  {
    id: "empty",
    title: "Empty list",
    axis: "state",
    description:
      'No traffic yet. List shows the "No requests yet" empty state; inspector shows its placeholder.',
    messages: [],
    config: { connection: "open" },
  },
  {
    id: "loading",
    title: "Loading / connecting",
    axis: "state",
    description:
      'Connected to the proxy but no exchanges have arrived. Status bar shows the amber pulsing dot and "connecting".',
    messages: [],
    config: { connection: "connecting" },
  },
  {
    id: "error-row",
    title: "Error row",
    axis: "state",
    description:
      "An exchange whose upstream connection failed: the list row shows a red Error badge (no status). Selected so the inspector renders the error message in the context bar and body pane.",
    messages: [
      makeGetRequest(1, "/api/flaky"),
      makeProxyError(1, "Request", "connection refused (os error 111)"),
    ],
    config: { selectedId: 1 },
  },
  {
    id: "error-midstream",
    title: "Mid-stream error",
    axis: "state",
    description:
      "An exchange that received a response (200 OK) but was interrupted mid-stream: the list row shows both the status and an Error badge. The context bar shows both the status code and the error message. The body pane shows the error instead of blank content.",
    messages: [
      makeGetRequest(1, "/api/stream"),
      makeResponse(1, "200 OK", undefined),
      makeProxyError(1, "Response", "connection reset by peer (os error 104)"),
    ],
    config: { selectedId: 1 },
  },
  {
    id: "selected",
    title: "Selected exchange",
    axis: "state",
    description:
      "A populated list with one exchange selected (accent bar + active background); inspector shows its bodies/headers/timing.",
    messages: [...backdrop(), makeResponseBody(2)],
    config: { selectedId: 2 },
  },
  {
    id: "hover",
    title: "Row hover",
    axis: "state",
    description:
      "Populated list with nothing selected; hover a row to see the hover background.",
    interact: (page) => page.getByText("/api/users").first().hover(),
    messages: backdrop(),
    config: { selectedId: null },
  },

  // ---- data axis ----------------------------------------------------------
  {
    id: "long-uri",
    title: "Long URI + query",
    axis: "data",
    description:
      "A request with a deep path and a long query string. Verify truncation/clipping affordances (row title tooltip, context-bar handling) at every width.",
    messages: [makeLongUriRequest(1, LONG_URI), makeResponse(1, "200 OK")],
    config: { selectedId: 1 },
  },
  {
    id: "long-error",
    title: "Long error text",
    axis: "data",
    description:
      "A proxy error carrying a verbose hyper-style error chain. Verify the error surfaces without breaking layout.",
    messages: [
      makeGetRequest(1, "/v1/ingest"),
      makeProxyError(1, "Request", LONG_ERROR_MESSAGE),
    ],
    config: { selectedId: 1 },
  },
  {
    id: "many-rows",
    title: "Many rows (120)",
    axis: "data",
    description:
      "120 complete exchanges to exercise virtualization, scroll, and the status-bar count. Verify smooth scroll and stable row heights.",
    messages: makeManyExchanges(120),
    config: { selectedId: 1 },
  },
  {
    id: "dual-size",
    title: "Dual wire/decoded size",
    axis: "data",
    description:
      "A gzip-compressed JSON response whose decoded size is cached. In table mode the Size column shows the wire size with a compression marker; hover for the wire/decoded tooltip. Opening the body decodes cleanly.",
    messages: [makeGetRequest(1, "/api/gzipped"), makeDualSizeResponse(1)],
    config: {
      selectedId: 1,
      decoded: [
        { id: 1, direction: "response", bytes: GZIP_JSON_DECODED_BYTES },
      ],
    },
  },

  // ---- view axis ----------------------------------------------------------
  {
    id: "table-mode",
    title: "Table mode",
    axis: "view",
    description:
      "The same backdrop rendered in table mode (columnar Method/Status/Path/Elapsed/Size/Time).",
    messages: backdrop(),
    config: { listMode: "table", selectedId: 2 },
  },
  {
    id: "compact-rows",
    title: "Compact density (rows)",
    axis: "view",
    description:
      "Rows mode at compact density — tighter row height. Compare against the default regular density.",
    messages: backdrop(),
    config: { listMode: "rows", density: "compact", selectedId: 2 },
  },
  {
    id: "compact-table",
    title: "Compact density (table)",
    axis: "view",
    description:
      "Table mode at compact density — the tightest row height in the app.",
    messages: backdrop(),
    config: { listMode: "table", density: "compact", selectedId: 2 },
  },

  // ---- cross-axis (view × data combinations) ------------------------------
  // The single-axis scenes above exercise table/compact density and the
  // data-extremes (long URI, dual size, many rows) independently, but never
  // together — so column-width allocation under realistic pressure went
  // untested. These cross the view axis with the data axis (PRO-250, gap
  // surfaced during the PRO-242 sweep). All reuse existing builders; the
  // `backdrop()` exchanges occupy ids 1..4 and the stress row is id 5.
  {
    id: "table-dual-size",
    title: "Table + dual size",
    axis: "view",
    description:
      "Table mode with a gzip row. The Size column shows a single bounded size with a compression marker icon (the wire/decoded/encoding breakdown is in the tooltip), so it never crowds the Elapsed/Time columns.",
    messages: [
      ...backdrop(),
      makeGetRequest(5, "/api/gzipped"),
      makeDualSizeResponse(5),
    ],
    config: {
      listMode: "table",
      selectedId: 5,
      decoded: [
        { id: 5, direction: "response", bytes: GZIP_JSON_DECODED_BYTES },
      ],
    },
  },
  {
    id: "table-long-uri",
    title: "Table + long URI",
    axis: "view",
    description:
      "Table mode with one deep-path + long-query row among normal rows. Verify the Path column truncates/ellipsises and holds its width instead of pushing Elapsed/Size/Time off-screen.",
    messages: [...backdrop(), makeLongUriRequest(5), makeResponse(5, "200 OK")],
    config: { listMode: "table", selectedId: 5 },
  },
  {
    id: "compact-table-long-uri",
    title: "Compact table + long URI",
    axis: "view",
    description:
      "The table-long-uri pressure at compact density — tightest rows plus an overflowing Path. Verify truncation and vertical rhythm hold at the smallest row height.",
    messages: [...backdrop(), makeLongUriRequest(5), makeResponse(5, "200 OK")],
    config: { listMode: "table", density: "compact", selectedId: 5 },
  },
  {
    id: "compact-rows-dual-size",
    title: "Compact rows + dual size",
    axis: "view",
    description:
      "Rows mode at compact density with a gzip dual `wire/decoded (gz)` size label. Verify the compound size label fits the tighter row without overlapping the path or timing.",
    messages: [
      ...backdrop(),
      makeGetRequest(5, "/api/gzipped"),
      makeDualSizeResponse(5),
    ],
    config: {
      listMode: "rows",
      density: "compact",
      selectedId: 5,
      decoded: [
        { id: 5, direction: "response", bytes: GZIP_JSON_DECODED_BYTES },
      ],
    },
  },
  {
    id: "mixed-table",
    title: "Mixed realistic table",
    axis: "view",
    description:
      "Heterogeneous traffic in table mode: plain rows, a gzip dual-size row, a long-URI row, and an Error row. Real traffic is mixed, so this stresses column allocation more realistically than any single-axis scene.",
    messages: [
      ...makeCompleteExchange(1, "GET", "/api/users", "200 OK", {
        elapsed: 34,
      }),
      ...makeCompleteExchange(2, "POST", "/api/orders", "201 Created", {
        elapsed: 88,
      }),
      makeGetRequest(3, "/api/gzipped"),
      makeDualSizeResponse(3),
      makeLongUriRequest(4),
      makeResponse(4, "200 OK"),
      makeGetRequest(5, "/api/flaky"),
      makeProxyError(5, "Request", "connection refused (os error 111)"),
      ...makeCompleteExchange(
        6,
        "DELETE",
        "/api/sessions/abc",
        "500 Internal Server Error",
        { elapsed: 503 },
      ),
    ],
    config: {
      listMode: "table",
      selectedId: 3,
      decoded: [
        { id: 3, direction: "response", bytes: GZIP_JSON_DECODED_BYTES },
      ],
    },
  },

  // ---- trace axis (traceparent grouping) ----------------------------------
  // Distributed-trace correlation: exchanges sharing a `traceparent` trace-id
  // render a coloured trace bar + rail, the inspector's trace pill gains a "next
  // in trace" jump, and the trace-id surfaces in the inspector's Timing facts and
  // (when filtered) the FilterBar chip. No single-axis scene set a traceId, so
  // none of this was in the matrix (PRO-250).
  {
    id: "trace-group",
    title: "Trace grouping",
    axis: "data",
    description:
      "Two distinct traces (different colours) interleaved with untraced rows. Verify the left trace colour bars, the trace rail, and — a trace member is selected — the inspector trace pill's 'next in trace' jump and the inspector Timing 'Trace ID' row.",
    messages: tracedTraffic(),
    // Newest-first order displays trace A as [5, 3, 1]; selecting id 5 (the
    // newest hop) guarantees a forward "next in trace" target (id 3).
    config: { selectedId: 5 },
  },
  {
    id: "trace-filtered",
    title: "Trace filter active",
    axis: "data",
    description:
      "The same traffic narrowed to trace A via an active trace filter. Verify the FilterBar trace chip (coloured dot + shortened id + clear button), the `N of M` count, and that only trace-A rows remain.",
    messages: tracedTraffic(),
    config: { traceFilter: TRACE_A, selectedId: 1 },
  },

  // ---- state axis: SSE stream scenes --------------------------------------
  // These exercise the incremental SSE pipeline end-to-end: the reducer
  // parses events into `sseState`, and the stream views consume them directly.
  {
    id: "stream-complete",
    title: "SSE stream (complete)",
    axis: "state",
    description:
      "A generic SSE stream with several events, completed (atEnd: true). StreamView renders the event list with a gray 'complete' indicator.",
    messages: [
      makePostRequest(1, "/api/stream"),
      makeSSEResponse(
        1,
        'event: ping\ndata: keepalive\n\nevent: message\ndata: hello world\n\nevent: update\ndata: {"count":42}\n\n',
      ),
    ],
    config: { selectedId: 1 },
  },
  {
    id: "stream-live",
    title: "SSE stream (live)",
    axis: "state",
    description:
      "A generic SSE stream still receiving events (atEnd: false). StreamView shows a green pulsing 'live' indicator. Initial response delivers two events; a BodyData event adds a third.",
    messages: [
      makePostRequest(1, "/api/stream"),
      makeSSEResponse(
        1,
        "event: ping\ndata: keepalive\n\nevent: message\ndata: first event\n\n",
        undefined,
        false,
      ),
      makeSSEBodyData(
        1,
        "event: update\ndata: streaming chunk\n\n",
        false,
        120,
      ),
    ],
    config: { selectedId: 1 },
  },
  {
    id: "stream-paused",
    title: "SSE stream (paused)",
    axis: "state",
    description:
      "A live SSE stream with the play/pause toggle paused. StreamView shows a paused indicator and the event list is frozen at the snapshot.",
    interact: (page) =>
      page.getByRole("button", { name: "Pause stream" }).click(),
    messages: [
      makePostRequest(1, "/api/stream"),
      makeSSEResponse(
        1,
        "event: ping\ndata: keepalive\n\nevent: message\ndata: first event\n\n",
        undefined,
        false,
      ),
      makeSSEBodyData(
        1,
        "event: update\ndata: streaming chunk\n\n",
        false,
        120,
      ),
    ],
    config: { selectedId: 1 },
  },
  {
    id: "stream-anthropic",
    title: "Anthropic SSE stream",
    axis: "state",
    description:
      "An Anthropic-protocol SSE stream (complete). ChatStreamView renders transcript/events toggle. Protocol set to 'Anthropic'.",
    messages: [
      makePostRequest(1, "/v1/messages"),
      makeSSEResponse(
        1,
        [
          'event: message_start\ndata: {"type":"message_start","message":{"id":"msg_01XFDUDYJgAACzvnptvVoYEL","model":"claude-3-5-sonnet-20241022","role":"assistant","content":[],"stop_reason":null,"usage":{"input_tokens":25,"output_tokens":1}}}\n\n',
          'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n',
          'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello! How can I help you today?"}}\n\n',
          'event: content_block_stop\ndata: {"type":"content_block_stop","index":0}\n\n',
          'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},"usage":{"output_tokens":12}}\n\n',
          'event: message_stop\ndata: {"type":"message_stop"}\n\n',
        ].join(""),
      ),
    ],
    config: { selectedId: 1, protocol: "Anthropic" },
  },
  {
    id: "stream-anthropic-transcript",
    title: "Anthropic SSE stream (transcript mode)",
    axis: "state",
    description:
      "The same Anthropic SSE stream as 'stream-anthropic' but with the transcript tab active. ChatStreamView renders the assembled text output with model/message-id metadata, stop_reason, and token usage. Protocol = 'Anthropic'.",
    interact: (page) => page.getByRole("radio", { name: "transcript" }).click(),
    messages: [
      makePostRequest(1, "/v1/messages"),
      makeSSEResponse(
        1,
        [
          'event: message_start\ndata: {"type":"message_start","message":{"id":"msg_01XFDUDYJgAACzvnptvVoYEL","model":"claude-3-5-sonnet-20241022","role":"assistant","content":[],"stop_reason":null,"usage":{"input_tokens":25,"output_tokens":1}}}\n\n',
          'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n',
          'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello! How can I help you today?"}}\n\n',
          'event: content_block_stop\ndata: {"type":"content_block_stop","index":0}\n\n',
          'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},"usage":{"output_tokens":12}}\n\n',
          'event: message_stop\ndata: {"type":"message_stop"}\n\n',
        ].join(""),
      ),
    ],
    config: { selectedId: 1, protocol: "Anthropic" },
  },
  {
    id: "stream-error",
    title: "SSE stream (error)",
    axis: "state",
    description:
      "A generic SSE stream interrupted by a Response-direction error. StreamView shows a red 'disconnected' indicator and the StreamErrorBanner with the error message below the event list.",
    messages: [
      makePostRequest(1, "/api/stream"),
      makeSSEResponse(
        1,
        "event: ping\ndata: keepalive\n\nevent: message\ndata: hello world\n\n",
        undefined,
        false,
      ),
      makeProxyError(1, "Response", "connection reset by peer (os error 104)"),
    ],
    config: { selectedId: 1 },
  },
  {
    id: "stream-anthropic-error",
    title: "Anthropic SSE stream (error)",
    axis: "state",
    description:
      "An Anthropic-protocol SSE stream interrupted by a Response-direction error. ChatStreamView shows a red 'disconnected' indicator and the StreamErrorBanner. Protocol set to 'Anthropic'.",
    messages: [
      makePostRequest(1, "/v1/messages"),
      makeSSEResponse(
        1,
        [
          'event: message_start\ndata: {"type":"message_start","message":{"id":"msg_01XFDUDYJgAACzvnptvVoYEL","model":"claude-3-5-sonnet-20241022","role":"assistant","content":[],"stop_reason":null,"usage":{"input_tokens":25,"output_tokens":1}}}\n\n',
          'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello! How can I"}}\n\n',
        ].join(""),
        undefined,
        false,
      ),
      makeProxyError(1, "Response", "connection reset by peer (os error 104)"),
    ],
    config: { selectedId: 1, protocol: "Anthropic" },
  },

  // ---- body-pane terminal modes -------------------------------------------
  // The existing scenes cover JSON bodies (selected, dual-size, etc.) and
  // SSE stream bodies, but left the other BodyPane branches unexercised
  // (PRO-396). These scenes target each remaining render path in BodyPane.
  {
    id: "body-awaiting",
    title: "Awaiting response",
    axis: "state",
    description:
      'A request that has not yet received a response. The status badge in the context bar shows the pulsing ··· placeholder and the response body pane shows "Awaiting response…".',
    messages: [makeGetRequest(1, "/api/slow")],
    config: { selectedId: 1 },
  },
  {
    id: "body-no-body",
    title: "No body (204)",
    axis: "state",
    description:
      'A 204 No Content response with no body. The response body pane shows the "No body" empty state (distinct from "Awaiting response…").',
    messages: [
      makeGetRequest(1, "/api/items/42"),
      makeResponse(1, "204 No Content"),
    ],
    config: { selectedId: 1 },
  },
  {
    id: "body-text",
    title: "Plain text body",
    axis: "state",
    description:
      "A text/plain response body. BodyPane renders the content in a <pre> block (the text render branch, distinct from JSON tree and binary).",
    messages: [makeGetRequest(1, "/api/health"), makeTextResponse(1)],
    config: { selectedId: 1 },
  },
  {
    id: "body-html",
    title: "HTML body (formatted)",
    axis: "state",
    description:
      "A text/html response. BodyPane's formatted view re-indents the minified markup and syntax-highlights it (PRO-414), virtualized line-by-line.",
    messages: [makeGetRequest(1, "/index.html"), makeHtmlResponse(1)],
    config: { selectedId: 1 },
  },
  {
    id: "body-xml",
    title: "XML body (formatted)",
    axis: "state",
    description:
      "An application/xml SOAP response. BodyPane's formatted view re-indents and syntax-highlights the XML (PRO-414), virtualized line-by-line.",
    messages: [makeGetRequest(1, "/service.xml"), makeXmlResponse(1)],
    config: { selectedId: 1 },
  },
  {
    id: "body-binary",
    title: "Binary body",
    axis: "state",
    description:
      'An application/octet-stream binary response. BodyPane shows the "Binary data · N bytes" lifecycle state instead of content.',
    messages: [
      makeGetRequest(1, "/api/download/artifact.bin"),
      makeBinaryResponse(1, "AAECAwQFBgcICQoLDA0ODw==", 12),
    ],
    config: { selectedId: 1 },
  },
  {
    id: "body-decode-failed",
    title: "Decode failed",
    axis: "state",
    description:
      'A response with Content-Encoding: gzip but a corrupt (non-gzip) payload. The decode pipeline throws, so BodyPane shows "Could not decode body".',
    messages: [
      makeGetRequest(1, "/api/compressed"),
      makeEncodedJsonResponse(1, "AAAA", 3, "gzip"),
    ],
    config: { selectedId: 1 },
  },

  // ---- NDJSON / JSONL view ------------------------------------------------
  {
    id: "ndjson",
    title: "NDJSON body (document trees)",
    axis: "data",
    description:
      "An application/x-ndjson response with several JSON lines. Renders as a forest of independently-collapsible document trees in one virtualized stream — each line is its own collapsed tree with a numbered gutter and count badge. Expand a document to drill into it.",
    messages: [makeGetRequest(1, "/api/events/stream"), makeNDJsonResponse(1)],
    config: { selectedId: 1 },
  },
  {
    id: "ndjson-text",
    title: "NDJSON body (text view)",
    axis: "data",
    description:
      "The same NDJSON body as 'ndjson' but with the response view-mode set to 'text'. Body pane renders the raw newline-delimited text in TextView instead of the parsed tree forest. Verify the text block, the Tree/Text/Hex mode selector tabs, and that the Text tab is active. Exercises the view-mode selector and text rendering path at all widths, including 1024.",
    messages: [makeGetRequest(1, "/api/events/stream"), makeNDJsonResponse(1)],
    config: { selectedId: 1, responseViewMode: "text" },
  },

  // ---- Truncated body -----------------------------------------------------
  {
    id: "body-truncated",
    title: "Truncated JSON body",
    axis: "data",
    description:
      "An application/json response whose body was cut off mid-structure. The viewer recovers the valid prefix (best-effort-json-parser), shows the amber truncation banner above the tree, and marks the cut point in-tree with a 'truncated here' annotation on the last parsed node. Verify the banner and marker in both themes.",
    messages: [makeGetRequest(1, "/_search"), makeTruncatedJsonResponse(1)],
    config: { selectedId: 1 },
  },
  {
    id: "body-truncated-ndjson",
    title: "Truncated NDJSON body",
    axis: "data",
    description:
      "An application/x-ndjson response whose final line was cut off mid-structure. The leading documents parse cleanly; the viewer recovers the valid prefix of the last line (best-effort-json-parser), shows the amber truncation banner above the forest, and marks the cut point in-tree on the final document with a 'truncated here' annotation. Verify the banner and marker in both themes.",
    messages: [
      makeGetRequest(1, "/api/events/stream"),
      makeTruncatedNdjsonResponse(1),
    ],
    config: { selectedId: 1 },
  },

  // ---- view axis: compact inspector + headers/timing isolated scenes -------
  {
    id: "compact-inspector",
    title: "Compact density + inspector",
    axis: "view",
    description:
      "Compact density with a selected exchange that has a JSON response body. Verifies that the inspector/body pane content renders correctly at compact density (list rows are tighter; inspector layout is unaffected).",
    messages: [...backdrop(), makeResponseBody(2)],
    config: { listMode: "rows", density: "compact", selectedId: 2 },
  },
  {
    id: "headers-selected",
    title: "Headers tab",
    axis: "view",
    description:
      "An exchange with many request and response headers selected. Verify the Headers tab: side-by-side request/response columns, header names and values, overflow and wrapping.",
    interact: (page) => page.getByRole("tab", { name: "Headers" }).click(),
    messages: [
      {
        exchange: { exchange_id: 1, timestamp: "2024-01-01T00:00:00Z" },
        direction: "Request",
        event: {
          type: "Request",
          method: "POST",
          uri: "/api/v2/ingest",
          version: "HTTP/1.1",
          headers: [
            { name: "Content-Type", value: "application/json" },
            {
              name: "Authorization",
              value: "Bearer eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ1c2VyXzEyMyJ9",
            },
            {
              name: "X-Request-Id",
              value: "a3f2c1d4-8e7b-4a9c-b5d6-1234567890ab",
            },
            { name: "X-Forwarded-For", value: "203.0.113.42" },
            { name: "Accept", value: "application/json" },
            { name: "Accept-Encoding", value: "gzip, deflate, br" },
            {
              name: "User-Agent",
              value: "protospy-client/1.0 (compatible; curl/8.4)",
            },
            {
              name: "traceparent",
              value: "00-4bf92f3577b34da6a3ce929d0e0e4736-0000000000000001-01",
            },
          ],
          body: { type: "NoBody" },
        },
      },
      makeResponse(1, "200 OK", '{"status":"ok","ingested":42}', undefined, [
        { name: "Content-Type", value: "application/json" },
        { name: "X-Request-Id", value: "a3f2c1d4-8e7b-4a9c-b5d6-1234567890ab" },
        { name: "X-RateLimit-Limit", value: "1000" },
        { name: "X-RateLimit-Remaining", value: "997" },
        { name: "X-RateLimit-Reset", value: "1704067260" },
        { name: "Cache-Control", value: "no-store" },
        { name: "Vary", value: "Accept, Accept-Encoding" },
        {
          name: "Strict-Transport-Security",
          value: "max-age=31536000; includeSubDomains",
        },
      ]),
    ],
    config: { selectedId: 1 },
  },
  {
    id: "timing-selected",
    title: "Timing tab",
    axis: "view",
    description:
      "A slow exchange with a traceparent header selected. Verify the Timing tab: Started timestamp, HTTP version, method, status, elapsed time, request/response sizes, and Trace ID row.",
    interact: (page) => page.getByRole("tab", { name: "Timing" }).click(),
    messages: [
      ...makeCompleteExchange(1, "POST", "/api/v1/search", "200 OK", {
        traceId: "4bf92f3577b34da6a3ce929d0e0e4736",
        elapsed: 1247,
        responseBody: '{"hits":[],"total":0}',
      }),
    ],
    config: { selectedId: 1 },
  },

  // ---- overlay / dialog states --------------------------------------------
  // These scenes exercise modal UI states — the ⌘K command palette and the
  // `?` keyboard-shortcuts overlay — that sit in front of the main layout and
  // are toggled by store flags (`cmdKOpen` / `helpOpen`). The backdrop below
  // provides enough data to populate the command palette's "Jump to trace"
  // group (trace A and trace B, same ids as the trace-group scene).
  {
    id: "cmdk-open",
    title: "Command palette open",
    axis: "state",
    description:
      "The ⌘K command palette rendered over the main layout. The backdrop carries two distinct traces so the 'Jump to trace' command group is populated. Verify the dialog frame, input, command list (View / Filter / Jump to trace / Theme / Help groups), and the overlay backdrop.",
    messages: tracedTraffic(),
    config: { cmdKOpen: true, selectedId: 5 },
  },
  {
    id: "help-open",
    title: "Keyboard-shortcuts overlay open",
    axis: "state",
    description:
      "The `?` keyboard-shortcuts Dialog rendered over the main layout. Verify the dialog frame, title ('Keyboard shortcuts'), the three shortcut groups (Navigate / Search & filter / View), the <kbd> key chips, and the overlay backdrop.",
    messages: backdrop(),
    config: { helpOpen: true, selectedId: 2 },
  },
];

/** A JSON response body for an existing exchange id (used by the selected cell). */
function makeResponseBody(id: number): Msg {
  return makeResponse(
    id,
    "201 Created",
    '{"id":4821,"status":"created","items":[{"sku":"A-1","qty":2}]}',
  );
}

/** Look up a scene by id. Returns undefined if unknown. */
export function getScene(id: string): Scene | undefined {
  return SCENES.find((s) => s.id === id);
}

/**
 * Reset the store and drive it to the given scene. Pure with respect to the
 * DOM — it only calls store actions, so it works identically in jsdom unit
 * tests and in the live browser (via `window.__test_scenes`).
 */
export function applySceneToStore(store: AppStore, scene: Scene): void {
  // Hard reset to initial state. Theme is no longer in the store (next-themes
  // owns the `.dark` class on <html>), so the reset can't clobber it — the
  // visual-review "set theme once, inject many scenes" pattern (PRO-253/PRO-256)
  // holds because theme lives outside the store. Drive theme via
  // `window.__test_theme.setTheme(...)`.
  store.setState(store.getInitialState(), true);

  const s = store.getState();
  // Only set a service when explicitly requested — doing so opens a live SSE
  // subscription whose status callback would clobber `connection` below.
  if (scene.config?.service != null) s.setService(scene.config.service);
  s.setConnection(scene.config?.connection ?? "open");

  for (const msg of scene.messages) {
    // Fixtures are typed loosely as Record<string, unknown>; the store's
    // applyEvent expects an EventMessage. The fixtures produce valid wire
    // shapes, so the cast is safe.
    s.applyEvent(msg as never);
  }

  const c = scene.config;
  if (c?.protocol !== undefined) s.setProtocol(c.protocol);
  if (c?.listMode !== undefined) s.setListMode(c.listMode);
  if (c?.density !== undefined) s.setDensity(c.density);
  if (c?.listWidth !== undefined) {
    s.setListWidth(c.listWidth.mode, c.listWidth.width);
  }
  if (c?.filter !== undefined) s.setFilter(c.filter);
  if (c?.traceFilter !== undefined) s.setTraceFilter(c.traceFilter);
  for (const d of c?.decoded ?? []) {
    s.setBodyDecodedBytes(d.id, d.direction, d.bytes);
  }
  if (c?.cmdKOpen !== undefined) s.setCmdKOpen(c.cmdKOpen);
  if (c?.helpOpen !== undefined) s.setHelpOpen(c.helpOpen);
  if (c?.requestViewMode !== undefined) s.setRequestViewMode(c.requestViewMode);
  if (c?.responseViewMode !== undefined)
    s.setResponseViewMode(c.responseViewMode);
  // Selection last so it isn't clobbered by anything above.
  if (c?.selectedId !== undefined) s.setSelectedId(c.selectedId);
}

/** Serializable scene metadata exposed to the review subagent. */
export interface SceneMeta {
  id: string;
  title: string;
  axis: SceneAxis;
  description: string;
  /** Whether the scene carries an `interact` function (not serializable itself). */
  hasInteract: boolean;
}

function toMeta(scene: Scene): SceneMeta {
  return {
    id: scene.id,
    title: scene.title,
    axis: scene.axis,
    description: scene.description,
    hasInteract: scene.interact != null,
  };
}

export interface SceneHarness {
  /** Metadata for every scene, in matrix order. */
  list: () => SceneMeta[];
  /** The three supported review widths. */
  widths: readonly number[];
  /** Reset the store and apply the named scene. Returns false if unknown. */
  apply: (id: string) => boolean;
  /**
   * Apply a scene and wait for React to settle. Combines apply + setTimeout
   * into a single async call, saving an IPC round-trip when called from
   * `playwright-cli eval` or `page.evaluate()`.
   *
   * @param settleMs — milliseconds to wait after applying (default 150).
   * @returns false if the scene id is unknown.
   */
  applyAndSettle: (id: string, settleMs?: number) => Promise<boolean>;
}

declare global {
  interface Window {
    __test_scenes?: SceneHarness;
  }
}

/**
 * Install the dev-only `window.__test_scenes` harness. Called from `main.tsx`
 * under `import.meta.env.DEV`, mirroring the `window.__test_store` exposure in
 * `state/store.ts`. Never called from production or from unit tests.
 */
export function installSceneHarness(store: AppStore): void {
  if (typeof window === "undefined") return;
  window.__test_scenes = {
    list: () => SCENES.map(toMeta),
    widths: SUPPORTED_WIDTHS,
    apply: (id: string) => {
      const scene = getScene(id);
      if (scene == null) return false;
      applySceneToStore(store, scene);
      return true;
    },
    applyAndSettle: async (id: string, settleMs?: number) => {
      const scene = getScene(id);
      if (scene == null) return false;
      applySceneToStore(store, scene);
      await new Promise((r) => setTimeout(r, settleMs ?? 150));
      return true;
    },
  };
}
