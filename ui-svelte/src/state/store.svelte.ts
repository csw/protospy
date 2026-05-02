// SvelteMap: mutates in place, so Svelte's fine-grained reactivity tracks per-entry changes.
import { SvelteMap } from "svelte/reactivity";
import type { EventMessage } from "@bindings/EventMessage";
import type { ConnectionStatus } from "@ui/api/sse";
import { apply } from "./reducer";
export type { Exchange, BodyState } from "./reducer";

const exchanges = new SvelteMap<number, import("./reducer").Exchange>();
const ids = $state<number[]>([]);
let connection = $state<ConnectionStatus>("connecting");
let service = $state<string | null>(null);

export const store = {
  get exchanges() {
    return exchanges;
  },
  get ids() {
    return ids;
  },
  get connection() {
    return connection;
  },
  get service() {
    return service;
  },
};

export function applyEvent(msg: EventMessage): void {
  apply(exchanges, ids, msg);
}

export function setConnection(status: ConnectionStatus): void {
  connection = status;
}

export function setService(name: string): void {
  service = name;
}
