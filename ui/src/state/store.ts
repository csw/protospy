import { create } from "zustand";
import type { EventMessage } from "@bindings/EventMessage";
import type { ConnectionStatus } from "@ui/api/sse";
import { apply } from "./reducer";
export type { Exchange, BodyState } from "./reducer";

function initDarkMode(): boolean {
  const saved = localStorage.getItem("theme");
  if (saved === "dark") return true;
  if (saved === "light") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

interface StoreState {
  exchanges: Map<number, import("./reducer").Exchange>;
  ids: number[];
  connection: ConnectionStatus;
  service: string | null;

  // UI state
  selectedId: number | null;
  filter: string;
  traceFilter: string | null;
  hoverTraceId: string | null;
  listMode: "rows" | "table";
  listWidth: { rows: number; table: number };
  order: "newest" | "oldest";
  density: "regular" | "compact";
  traceGroupOn: boolean;
  cmdKOpen: boolean;
  darkMode: boolean;

  // Core actions
  applyEvent: (msg: EventMessage) => void;
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
}

export const useStore = create<StoreState>()((set) => ({
  exchanges: new Map(),
  ids: [],
  connection: "connecting",
  service: null,

  // UI state defaults
  selectedId: null,
  filter: "",
  traceFilter: null,
  hoverTraceId: null,
  listMode: "rows",
  listWidth: { rows: 340, table: 720 },
  order: "newest",
  density: "regular",
  traceGroupOn: false,
  cmdKOpen: false,
  darkMode: initDarkMode(),

  // Core actions
  applyEvent: (msg) =>
    set((state) => {
      const exchanges = new Map(state.exchanges);
      const ids = [...state.ids];
      apply(exchanges, ids, msg);
      return { exchanges, ids };
    }),

  setConnection: (status) => set({ connection: status }),

  setService: (name) => set({ service: name }),

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
      document.documentElement.setAttribute(
        "data-theme",
        next ? "dark" : "light",
      );
      localStorage.setItem("theme", next ? "dark" : "light");
      return { darkMode: next };
    }),
}));

if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__test_store = useStore;
}
