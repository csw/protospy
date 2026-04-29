import { create } from "zustand";
import type { EventMessage } from "@bindings/EventMessage";
import type { ConnectionStatus } from "@ui/api/sse";
import { apply } from "./reducer";
export type { Exchange, BodyState } from "./reducer";

interface StoreState {
  exchanges: Map<number, import("./reducer").Exchange>;
  ids: number[];
  connection: ConnectionStatus;
  service: string | null;

  applyEvent: (msg: EventMessage) => void;
  setConnection: (status: ConnectionStatus) => void;
  setService: (name: string) => void;
}

export const useStore = create<StoreState>()((set) => ({
  exchanges: new Map(),
  ids: [],
  connection: "connecting",
  service: null,

  applyEvent: (msg) =>
    set((state) => {
      const exchanges = new Map(state.exchanges);
      const ids = [...state.ids];
      apply(exchanges, ids, msg);
      return { exchanges, ids };
    }),

  setConnection: (status) => set({ connection: status }),

  setService: (name) => set({ service: name }),
}));
