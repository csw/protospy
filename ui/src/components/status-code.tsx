// src/components/protospy/status-code.tsx
// Network/transport failures and HTTP errors are DISTINCT states (handoff):
//  - transport error, no status   → "Error" in --error, plus the row's net-error treatment
//  - transport error, mid-stream   → "500 ✕": the status that DID arrive + an error mark
//  - HTTP status                   → coloured code (table) or full status line (rows)
//  - pending                       → muted ··· with a pulsing dot
// Exact error copy is owned by app code; this component only fixes the treatment.
//
// Consumes the live string `status` (PRO-359): the runtime `status` is a full
// reason-phrase line ("404 Not Found"), so rows mode renders it verbatim and table
// mode shows the numeric code only (kept deviation §3).

import { cn } from "@ui/lib/utils";
import { statusCodeOnly, statusKind } from "@ui/lib/exchange";
import type { StatusKind } from "@ui/lib/tokens";

const KIND_TEXT: Record<StatusKind, string> = {
  ok: "text-ok",
  redirect: "text-redirect",
  client: "text-client",
  server: "text-server",
  pending: "text-pending",
  error: "text-error",
};

export interface StatusCodeProps {
  /** Live status line, e.g. "200 OK"; undefined while pending or on a transport error. */
  status: string | undefined;
  hasError?: boolean;
  /** rows mode: show the full "404 Not Found"; table mode (default): code only. */
  full?: boolean;
  /** Native tooltip — e.g. the error message, or the full reason phrase in table mode. */
  title?: string;
  className?: string;
}

export function StatusCode({
  status,
  hasError,
  full,
  title,
  className,
}: StatusCodeProps) {
  const base = "font-mono text-sm font-semibold tabular-nums";

  if (hasError) {
    // Mid-stream: a status arrived, then the connection broke — surface both.
    const label = status != null ? `${statusCodeOnly(status)} ✕` : "Error";
    return (
      <span
        data-testid="status-code"
        data-error
        title={title}
        className={cn(base, "text-error", className)}
      >
        {label}
      </span>
    );
  }
  if (status == null) {
    return (
      <span
        data-testid="status-code"
        title={title}
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
        <span className="sr-only">pending</span>
        ···
      </span>
    );
  }
  return (
    <span
      data-testid="status-code"
      title={title}
      className={cn(base, KIND_TEXT[statusKind(status)], className)}
    >
      {full ? status : statusCodeOnly(status)}
    </span>
  );
}
