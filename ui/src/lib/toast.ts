// Lib-level toast emissions for copy + connection feedback. Per
// `docs/ui/design-system.md` §3 ("Copy / connection toast → `sonner` → lib"),
// the toast wiring lives here, not in components — components call these helpers
// and the already-mounted `<Toaster />` host (App.tsx) renders them. The pure
// connection-toast decision lives in `@ui/lib/connection-toast` so it stays
// unit-testable without `sonner`.
import { toast } from "sonner";
import type { ConnectionStatus } from "@ui/api/sse";
import { connectionToast } from "@ui/lib/connection-toast";

// Shared toast id for copy feedback: passing a stable id makes `sonner` replace
// the existing toast rather than stack a new one, so rapid repeat clicks (or a
// success following a failure) collapse to a single visible toast.
const COPY_TOAST_ID = "copy-feedback";

/** Copy-to-clipboard succeeded. */
export function notifyCopied(): void {
  toast.success("Copied to clipboard", { id: COPY_TOAST_ID });
}

/** Copy-to-clipboard failed (e.g. clipboard permission denied). */
export function notifyCopyFailed(): void {
  toast.error("Couldn't copy to clipboard", { id: COPY_TOAST_ID });
}

/** Emit the connection toast (if any) for a `prev → next` status transition. */
export function notifyConnection(
  prev: ConnectionStatus | null,
  next: ConnectionStatus,
): void {
  const t = connectionToast(prev, next);
  if (t) toast[t.kind](t.message);
}
