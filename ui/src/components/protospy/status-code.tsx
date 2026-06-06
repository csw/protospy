// src/components/protospy/status-code.tsx
// Network/transport failures and HTTP errors are DISTINCT states (handoff):
//  - transport error  → "Error" in --error, plus the row's net-error treatment
//  - HTTP status       → coloured code (table) or full status line (rows)
//  - pending           → muted ··· with a pulsing dot
// Exact error copy is owned by app code; this component only fixes the treatment.

import { cn } from "@/lib/utils";
import { statusClass, statusLine, type StatusKind } from "@/lib/tokens";

const KIND_TEXT: Record<StatusKind, string> = {
  ok: "text-ok",
  redirect: "text-redirect",
  client: "text-client",
  server: "text-server",
  pending: "text-pending",
  error: "text-error",
};

export interface StatusCodeProps {
  status: number | null;
  hasError?: boolean;
  /** rows mode: show "404 Not Found"; table mode (default): code only */
  full?: boolean;
  className?: string;
}

export function StatusCode({
  status,
  hasError,
  full,
  className,
}: StatusCodeProps) {
  const base = "font-mono font-semibold tabular-nums";

  if (hasError) {
    return <span className={cn(base, "text-error", className)}>Error</span>;
  }
  if (status == null) {
    return (
      <span
        className={cn(
          base,
          "text-pending inline-flex items-center gap-1",
          className,
        )}
      >
        <span
          className="size-1.5 rounded-full bg-redirect motion-safe:animate-pulse"
          aria-hidden
        />
        ···
      </span>
    );
  }
  const kind = statusClass(status);
  return (
    <span className={cn(base, KIND_TEXT[kind], className)}>
      {full ? statusLine(status) : status}
    </span>
  );
}
