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
//   - state: empty, loading, error row (ERR), selected, hover
//   - data:  long URI + query, long error, many rows, dual size
//   - view:  rows vs table, compact vs regular density
//   - cross: view × data combinations (table/compact crossed with a data
//            extreme) that stress column-width allocation
//   - trace: traceparent grouping (colour bars, trace rail, trace filter chip)
// The list-pane min/wide axis is an interaction (separator drag), not store
// state — see `browser/helpers/scenes.ts` and the matrix doc.

import type { ConnectionStatus } from "@ui/api/sse";
import type { AppStore } from "@ui/state/store";
import {
  GZIP_JSON_DECODED_BYTES,
  LONG_ERROR_MESSAGE,
  LONG_URI,
  makeCompleteExchange,
  makeDualSizeResponse,
  makeGetRequest,
  makeLongUriRequest,
  makeManyExchanges,
  makeProxyError,
  makeResponse,
} from "./fixtures";

type Msg = Record<string, unknown>;

/** The three desktop-only review widths (px). Below 1280 is unsupported. */
export const SUPPORTED_WIDTHS = [1280, 1440, 1920] as const;

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
   * Whether reaching this cell needs a follow-up interaction beyond store
   * injection (e.g. a row `:hover` or a separator drag). Documented so the
   * reviewer knows injection alone is not the whole picture.
   */
  interaction?: string;
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
    title: "Error row (ERR)",
    axis: "state",
    description:
      "An exchange whose upstream connection failed: the list row shows a red ERR badge (no status). Selected so the inspector renders the error too.",
    messages: [
      makeGetRequest(1, "/api/flaky"),
      makeProxyError(1, "Request", "connection refused (os error 111)"),
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
    interaction: "Hover an exchange row (CSS :hover; not store-injectable).",
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
      "A gzip-compressed JSON response whose decoded size is cached, so the list shows the `wire/decoded (gz)` size label. Hover the size for the explanatory tooltip; opening the body decodes cleanly.",
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
      "The same backdrop rendered in table mode (columnar Method/Status/Path/Time/Size/When).",
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
    config: { density: "compact", selectedId: 2 },
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
      "Table mode with a gzip row whose Size column shows the dual `wire/decoded (gz)` label beside plainly-sized rows. Verify the Size column absorbs the wider compound label without crowding Time/When.",
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
      "Table mode with one deep-path + long-query row among normal rows. Verify the Path column truncates/ellipsises and holds its width instead of pushing Time/Size/When off-screen.",
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
      "Heterogeneous traffic in table mode: plain rows, a gzip dual-size row, a long-URI row, and an ERR row. Real traffic is mixed, so this stresses column allocation more realistically than any single-axis scene.",
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
  // render a coloured trace bar + rail, the context bar gains "next in trace"
  // navigation, and the trace-id surfaces in TimingView and (when filtered) the
  // FilterBar chip. No single-axis scene set a traceId, so none of this was in
  // the matrix (PRO-250).
  {
    id: "trace-group",
    title: "Trace grouping",
    axis: "data",
    description:
      "Two distinct traces (different colours) interleaved with untraced rows. Verify the left trace colour bars, the trace rail, and — a trace member is selected — the context bar's 'next in trace' jump and TimingView's Trace ID row.",
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
  // Hard reset to initial state (mirrors browser/helpers/inject.ts resetStore).
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
  // Selection last so it isn't clobbered by anything above.
  if (c?.selectedId !== undefined) s.setSelectedId(c.selectedId);
}

/** Serializable scene metadata exposed to the review subagent. */
export interface SceneMeta {
  id: string;
  title: string;
  axis: SceneAxis;
  description: string;
  interaction?: string;
}

function toMeta(scene: Scene): SceneMeta {
  return {
    id: scene.id,
    title: scene.title,
    axis: scene.axis,
    description: scene.description,
    interaction: scene.interaction,
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
