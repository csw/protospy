import { create } from "zustand";
import { persist, subscribeWithSelector } from "zustand/middleware";
import type { EventMessage } from "@bindings/EventMessage";
import type { Protocol } from "@bindings/Protocol";
import type { ConnectionStatus } from "@ui/api/sse";
import type { TimeZone } from "@ui/lib/utils";
import { apply } from "./reducer";
export type { Exchange, BodyState } from "./reducer";

interface PersistedPrefs {
  listWidth: { rows: number; table: number };
  density: "regular" | "compact";
  order: "newest" | "oldest";
  listMode: "rows" | "table";
  traceGroupOn: boolean;
  /** Time zone for absolute timestamp display in table mode. */
  timeZone: TimeZone;
}

export interface StoreState extends PersistedPrefs {
  exchanges: Map<number, import("./reducer").Exchange>;
  ids: number[];
  connection: ConnectionStatus;
  service: string | null;
  protocol: Protocol | null;
  setProtocol: (protocol: Protocol | null) => void;

  // UI state (not persisted)
  selectedId: number | null;
  filter: string;
  traceFilter: string | null;
  hoverTraceId: string | null;
  cmdKOpen: boolean;

  // Core actions
  applyEvent: (msg: EventMessage) => void;
  /**
   * Cache the decompressed byte count for a body on its `BodyState`. Called
   * from `useDecodeBody` once the decode pipeline produces a result, so
   * surfaces outside the body pane (timing view, exchange list) can show a
   * dual wire/decoded size without re-running decode themselves. No-ops if
   * the exchange or body is gone or if the value hasn't changed.
   */
  setBodyDecodedBytes: (
    exchangeId: number,
    direction: "request" | "response",
    decodedBytes: number,
  ) => void;
  setConnection: (status: ConnectionStatus) => void;
  setService: (name: string) => void;

  // UI actions
  setSelectedId: (id: number | null) => void;
  setFilter: (filter: string) => void;
  setTraceFilter: (traceId: string | null) => void;
  setHoverTraceId: (traceId: string | null) => void;
  setListMode: (mode: "rows" | "table") => void;
  setListWidth: (mode: "rows" | "table", width: number) => void;
  setOrder: (order: "newest" | "oldest") => void;
  setDensity: (density: "regular" | "compact") => void;
  toggleTraceGroup: () => void;
  setCmdKOpen: (open: boolean) => void;
  setTimeZone: (tz: TimeZone) => void;
}

export const useStore = create<StoreState>()(
  subscribeWithSelector(
    persist(
      (set) => ({
        exchanges: new Map(),
        ids: [],
        connection: "connecting",
        service: null,
        protocol: null,

        // UI state defaults
        selectedId: null,
        filter: "",
        traceFilter: null,
        hoverTraceId: null,
        listMode: "table",
        listWidth: { rows: 340, table: 720 },
        order: "newest",
        density: "regular",
        traceGroupOn: false,
        cmdKOpen: false,
        timeZone: "local",

        // Core actions
        applyEvent: (msg) =>
          set((state) => {
            const exchanges = new Map(state.exchanges);
            const ids = [...state.ids];
            apply(exchanges, ids, msg);
            return { exchanges, ids };
          }),

        setBodyDecodedBytes: (exchangeId, direction, decodedBytes) =>
          set((state) => {
            const ex = state.exchanges.get(exchangeId);
            if (ex == null) return {};
            const body =
              direction === "request" ? ex.requestBody : ex.responseBody;
            if (body == null || body.decodedBytes === decodedBytes) return {};
            const updatedBody = { ...body, decodedBytes };
            const updatedEx = {
              ...ex,
              [direction === "request" ? "requestBody" : "responseBody"]:
                updatedBody,
            };
            const exchanges = new Map(state.exchanges);
            exchanges.set(exchangeId, updatedEx);
            return { exchanges };
          }),

        setConnection: (status) => set({ connection: status }),

        setService: (name) => set({ service: name }),

        setProtocol: (protocol) => set({ protocol }),

        // UI actions
        setSelectedId: (id) => set({ selectedId: id }),

        setFilter: (filter) => set({ filter }),

        setTraceFilter: (traceId) => set({ traceFilter: traceId }),

        setHoverTraceId: (traceId) => set({ hoverTraceId: traceId }),

        setListMode: (mode) => set({ listMode: mode }),

        setListWidth: (mode, width) =>
          set((state) => ({
            listWidth: { ...state.listWidth, [mode]: width },
          })),

        setOrder: (order) => set({ order }),

        setDensity: (density) => set({ density }),

        toggleTraceGroup: () =>
          set((state) => ({ traceGroupOn: !state.traceGroupOn })),

        setCmdKOpen: (open) => set({ cmdKOpen: open }),

        setTimeZone: (tz) => set({ timeZone: tz }),
      }),
      {
        name: "protospy-ui-prefs",
        version: 1,
        partialize: (state): PersistedPrefs => ({
          listWidth: state.listWidth,
          density: state.density,
          order: state.order,
          listMode: state.listMode,
          traceGroupOn: state.traceGroupOn,
          timeZone: state.timeZone,
        }),
        // onRehydrateStorage intentionally does NOT touch the DOM.
        // The subscribeWithSelector subscription with fireImmediately
        // handles the initial reconciliation after hydration.
      },
    ),
  ),
);

// ---------------------------------------------------------------------------
// Density ownership contract — the single runtime DOM writer for density.
//
// Mirrors the (now next-themes-owned) theme pattern: a single
// `subscribeWithSelector` subscription is the ONLY code path that writes
// `<html data-density>`. The `density` slice stays in the store (persisted);
// `useDensity()` reads it, and globals.css keys its size-token swaps + the
// `compact:` variant off the attribute this subscription sets. It fires:
//   - Immediately on store creation (fireImmediately).
//   - On every subsequent `density` change (user toggle, persist rehydration).
//
// Theme is intentionally NOT here — next-themes owns the `.dark` class on
// `<html>`; the old `applyTheme.ts` + `[data-theme=dark]` writer was retired.
// ---------------------------------------------------------------------------

function applyDensityToDOM(density: "regular" | "compact") {
  if (typeof document !== "undefined") {
    document.documentElement.setAttribute("data-density", density);
  }
}

useStore.subscribe((s) => s.density, applyDensityToDOM, {
  fireImmediately: true,
});

/**
 * The bound Zustand store API. Exported as a type so the dev-only scene
 * harness (`src/test/scenes.ts`) can be typed against the real store shape
 * without importing the store value (which would pull `window` side effects
 * into node-project unit tests).
 */
export type AppStore = typeof useStore;

// Expose the store for the Playwright harness (browser/helpers/inject.ts).
// Available in dev, and in test-mode preview builds via the VITE_EXPOSE_TEST_HOOKS
// flag from .env.test (see the `build:test` script) — but never in production.
if (import.meta.env.DEV || import.meta.env.VITE_EXPOSE_TEST_HOOKS === "true") {
  (window as unknown as Record<string, unknown>).__test_store = useStore;
}
