import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { EventMessage } from "@bindings/EventMessage";
import type { Protocol } from "@bindings/Protocol";
import type { ConnectionStatus } from "@ui/api/sse";
import { applyThemeToDOM } from "@ui/theme/applyTheme";
import { apply } from "./reducer";
export type { Exchange, BodyState } from "./reducer";

interface PersistedPrefs {
  listWidth: { rows: number; table: number };
  density: "regular" | "compact";
  order: "newest" | "oldest";
  listMode: "rows" | "table";
  traceGroupOn: boolean;
  darkMode: boolean;
  /**
   * Time zone for absolute timestamps in the table-view "When" column.
   * `local` uses the user's locale offset; `utc` is for log correlation.
   */
  timeZoneMode: "local" | "utc";
}

interface StoreState extends PersistedPrefs {
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
  toggleDarkMode: () => void;
  setTimeZoneMode: (mode: "local" | "utc") => void;
  toggleTimeZoneMode: () => void;
}

export const useStore = create<StoreState>()(
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
      // Table mode is the default — it's the denser, scan-friendly view that
      // users spend most time in. PRO-222 promoted it from a secondary toggle.
      listMode: "table",
      listWidth: { rows: 340, table: 720 },
      order: "newest",
      density: "regular",
      traceGroupOn: false,
      cmdKOpen: false,
      darkMode: true,
      timeZoneMode: "local",

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

      toggleDarkMode: () =>
        set((state) => {
          const next = !state.darkMode;
          applyThemeToDOM(next);
          return { darkMode: next };
        }),

      setTimeZoneMode: (mode) => set({ timeZoneMode: mode }),

      toggleTimeZoneMode: () =>
        set((state) => ({
          timeZoneMode: state.timeZoneMode === "local" ? "utc" : "local",
        })),
    }),
    {
      name: "protospy-ui-prefs",
      // Bump version and add a `migrate` function when PersistedPrefs shape changes.
      version: 0,
      partialize: (state): PersistedPrefs => ({
        listWidth: state.listWidth,
        density: state.density,
        order: state.order,
        listMode: state.listMode,
        traceGroupOn: state.traceGroupOn,
        darkMode: state.darkMode,
        timeZoneMode: state.timeZoneMode,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          applyThemeToDOM(state.darkMode);
        }
      },
    },
  ),
);

if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__test_store = useStore;
}
