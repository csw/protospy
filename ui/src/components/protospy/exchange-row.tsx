// src/components/protospy/exchange-row.tsx — "rows" list mode (secondary view).
// Three lines: [method · status line · protocol tags · time] / path / timing.
// The left trace border is a dynamic per-trace color (inline var), gated by a class.
//
// Byte/elapsed formatting is owned by app code (handoff) — import from your
// formatter; signatures shown here for reference.

import { cn } from "@/lib/utils";
import { traceColorVar } from "@/lib/tokens";
import { fmtBytes, fmtMs, fmtClock } from "@/lib/format";
import type { Exchange } from "@/lib/types";
import { MethodBadge } from "./method-badge";
import { StatusCode } from "./status-code";
import { Badge } from "@/components/ui/badge";

export interface ExchangeRowProps {
  exchange: Exchange;
  selected?: boolean;
  tz?: "local" | "utc";
  onSelect?: () => void;
  onHoverTrace?: (traceId: string | null) => void;
}

export function ExchangeRow({
  exchange: x,
  selected,
  tz = "local",
  onSelect,
  onHoverTrace,
}: ExchangeRowProps) {
  const hasError = x.error != null;
  return (
    <button
      type="button"
      onClick={onSelect}
      onMouseEnter={() => x.traceId && onHoverTrace?.(x.traceId)}
      data-selected={selected || undefined}
      data-error={hasError || undefined}
      style={
        x.traceId
          ? ({
              "--trace-color": traceColorVar(x.traceId),
            } as React.CSSProperties)
          : undefined
      }
      className={cn(
        "group relative flex h-row w-full flex-col justify-center gap-0.5 overflow-hidden border-b px-gutter-x text-left text-secondary-foreground transition-colors",
        "hover:bg-hover data-[selected]:bg-accent",
        // selection bar
        "data-[selected]:before:absolute data-[selected]:before:inset-y-0 data-[selected]:before:left-0 data-[selected]:before:w-0.5 data-[selected]:before:bg-primary",
        // trace border (single-member traces still get it; rail only draws multi-member)
        x.traceId &&
          "after:absolute after:inset-y-0 after:left-0 after:w-1 after:bg-[--trace-color] data-[selected]:after:left-0.5",
        // network-error treatment, distinct from a 5xx
        hasError && "shadow-[inset_3px_0_0_var(--error)]",
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <MethodBadge method={x.method} />
        <StatusCode status={x.status} hasError={hasError} full />
        {x.protocol === "sse" && <Badge variant="secondary">SSE</Badge>}
        {x.protocol === "msearch" && (
          <Badge variant="outline">msearch ×{x.bundleCount}</Badge>
        )}
        <span className="ml-auto font-mono text-xs text-muted-foreground">
          {fmtClock(x.startedAt, tz)}
        </span>
      </div>
      <div className="truncate font-mono text-sm text-secondary-foreground group-data-[selected]:font-medium group-data-[selected]:text-foreground">
        {x.uri}
      </div>
      <div className="flex gap-2.5 overflow-hidden font-mono text-xs text-muted-foreground">
        <span className="whitespace-nowrap">
          {hasError ? x.error!.kind : fmtMs(x.elapsedMs)}
        </span>
        <span className="whitespace-nowrap">
          req {fmtBytes(x.request.wireBytes)}
        </span>
        <span className="whitespace-nowrap">
          res {x.response ? fmtBytes(x.response.wireBytes) : "—"}
        </span>
      </div>
    </button>
  );
}
