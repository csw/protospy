// Lib-level toast emissions for copy + connection feedback. Per
// `docs/ui/design-system.md` §3 ("Copy / connection toast → `sonner` → lib"),
// the toast wiring lives here, not in components — components call these helpers
// and the already-mounted `<Toaster />` host (App.tsx) renders them.
import { toast } from "sonner";
import type { ConnectionStatus } from "@ui/api/sse";

/** Copy-to-clipboard succeeded. */
export function notifyCopied(): void {
  toast.success("Copied to clipboard");
}

/** Copy-to-clipboard failed (e.g. clipboard permission denied). */
export function notifyCopyFailed(): void {
  toast.error("Couldn't copy to clipboard");
}

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

/** Emit the connection toast (if any) for a `prev → next` status transition. */
export function notifyConnection(
  prev: ConnectionStatus | null,
  next: ConnectionStatus,
): void {
  const t = connectionToast(prev, next);
  if (t) toast[t.kind](t.message);
}
