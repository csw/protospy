// Pure decision for connection-status toasts, kept side-effect-free so it can
// be unit-tested in the `node` project (no `sonner`, no DOM). The side-effecting
// emission wrapper lives in `@ui/lib/toast`.
import type { ConnectionStatus } from "@ui/api/sse";

export type ConnectionToast = {
  kind: "success" | "error";
  message: string;
} | null;

/**
 * Pure decision: which connection toast (if any) a status transition warrants.
 *
 * - First connect (`connecting → open`, no prior `reconnecting`) is **silent** —
 *   normal startup shouldn't toast.
 * - Losing the stream (`→ reconnecting`) fires one error toast; repeated
 *   `reconnecting` events (the SSE layer re-emits on every `onerror`) don't
 *   re-toast, since `prev` is already `reconnecting`.
 * - Recovering (`reconnecting → open`) fires a success toast.
 */
export function connectionToast(
  prev: ConnectionStatus | null,
  next: ConnectionStatus,
): ConnectionToast {
  if (next === "reconnecting" && prev !== "reconnecting") {
    return { kind: "error", message: "Connection lost — reconnecting…" };
  }
  if (next === "open" && prev === "reconnecting") {
    return { kind: "success", message: "Reconnected" };
  }
  return null;
}
