// src/lib/types.ts — small presentation-layer vocabulary enums shared by
// several components. The runtime domain model (Exchange / BodyState /
// ExchangeError) lives in state/types.ts, built from the @bindings wire
// types; keep entity shapes there and only the cross-component UI
// classifications here.

/**
 * Connection-indicator display vocabulary — distinct from the live SSE
 * transport status in `@ui/api/sse` (`connecting | open | reconnecting`).
 * `connection-dot.tsx` maps the transport status onto this via `connDotStatus`;
 * `down` is the reserved terminal/disconnected treatment.
 */
export type ConnectionStatus = "open" | "connecting" | "down";

export type StatusKind =
  | "ok"
  | "redirect"
  | "client"
  | "server"
  | "pending"
  | "error";
