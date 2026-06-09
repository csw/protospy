// src/components/protospy/connection-dot.tsx
// SSE connection state, as one atom shared by the top bar, status bar and
// inspector context bar. Driven by `connection` in the store (open / connecting
// / down) — note "connecting" is a first-class state with its own token, not a
// borrowed redirect amber. Pulses only while connecting, and respects
// prefers-reduced-motion.

import { cn } from "@/lib/utils";
import type { ConnectionStatus } from "@/lib/types";
import type { ConnectionStatus as SSEConnectionStatus } from "@ui/api/sse";

const DOT: Record<ConnectionStatus, string> = {
  open: "bg-conn-open shadow-[0_0_0_3px_var(--conn-open-bg)]",
  connecting:
    "bg-conn-connecting shadow-[0_0_0_3px_var(--conn-connecting-bg)] motion-safe:animate-pulse",
  down: "bg-conn-down shadow-[0_0_0_3px_var(--conn-down-bg)]",
};

/** Default user-facing copy per state — override via the `label` you render next to it. */
export const CONNECTION_LABEL: Record<ConnectionStatus, string> = {
  open: "connected",
  connecting: "connecting…",
  down: "disconnected",
};

/**
 * Map the live SSE connection model (`@ui/api/sse`: open / connecting /
 * reconnecting) onto this atom's design vocabulary (open / connecting / down).
 * The live feed has no terminal "down" state yet — it reconnects — so a
 * reconnecting socket reads as "connecting". The shell wire slice (PRO-363) owns
 * any future terminal/down mapping. v2.4 ingest: un-wired.
 */
export function connDotStatus(s: SSEConnectionStatus): ConnectionStatus {
  return s === "reconnecting" ? "connecting" : s;
}

export interface ConnectionDotProps {
  status: ConnectionStatus;
  className?: string;
}

export function ConnectionDot({ status, className }: ConnectionDotProps) {
  return (
    <span
      role="status"
      aria-label={CONNECTION_LABEL[status]}
      className={cn("size-2 shrink-0 rounded-full", DOT[status], className)}
    />
  );
}
