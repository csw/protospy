// src/components/protospy/exchange-row.tsx — "rows" list mode (secondary view).
// Three lines: [method · status line · protocol tags · time] / path / timing.
// The left trace border is a per-trace color, selected by a `data-trace` attribute
// (CSS sets `--trace-color` from it — no inline style, CSP-forward; paired with the
// Slice 1b rail).
//
// Consumes the live `Exchange` (PRO-359): string method/status, ISO `timestamp`
// rendered absolute (rows-mode relative age was a known oversight — kept deviation
// §3), `error.message` (not the generic `kind`), live protocol sniffers.

import { cn, formatAbsoluteTime } from "@ui/lib/utils";
import type { TimeZone } from "@ui/lib/utils";
import { fmtMs } from "@ui/lib/format";
import { traceTokenIndex } from "@ui/lib/tokens";
import {
  fmtBytesOrDash,
  isMsearchExchange,
  isSSEExchange,
  responseSizeView,
  sizeView,
} from "@ui/lib/exchange";
import type { Exchange } from "@ui/state/types";
import { MethodBadge } from "./method-badge";
import { StatusCode } from "./status-code";
import { Badge } from "@ui/components/ui/badge";
import { SimpleTooltip } from "@ui/components/ui/simple-tooltip";

export interface ExchangeRowProps {
  exchange: Exchange;
  selected?: boolean;
  tz?: TimeZone;
  onSelect?: () => void;
}

export function ExchangeRow({
  exchange: x,
  selected = false,
  tz = "local",
  onSelect,
}: ExchangeRowProps) {
  const hasError = x.error != null;
  const req = sizeView(x.requestBody);
  const res = responseSizeView(x);
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onSelect}
      data-selected={selected || undefined}
      data-error={hasError || undefined}
      data-trace={x.traceId ? traceTokenIndex(x.traceId) : undefined}
      className={cn(
        "group relative flex h-row w-full flex-col justify-center gap-0.5 overflow-hidden border-b px-gutter-x text-left text-secondary-foreground transition-colors",
        "hover:bg-hover data-[selected]:bg-accent",
        // selection bar
        "data-[selected]:before:absolute data-[selected]:before:inset-y-0 data-[selected]:before:left-0 data-[selected]:before:w-0.5 data-[selected]:before:bg-primary",
        // trace border (single-member traces still get it; rail only draws multi-member)
        x.traceId &&
          "after:absolute after:inset-y-0 after:left-0 after:w-1 after:bg-(--trace-color) data-[selected]:after:left-0.5",
        // network-error treatment, distinct from a 5xx
        hasError && "shadow-[inset_3px_0_0_var(--error)]",
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <MethodBadge method={x.method} />
        <StatusCode status={x.status} hasError={hasError} full />
        {isSSEExchange(x) && <Badge variant="secondary">SSE</Badge>}
        {isMsearchExchange(x) && <Badge variant="outline">msearch</Badge>}
        <span className="ml-auto font-mono text-xs text-muted-foreground">
          {formatAbsoluteTime(x.timestamp, tz)}
        </span>
      </div>
      <SimpleTooltip content={x.uri}>
        <div className="truncate font-mono text-sm text-secondary-foreground group-data-[selected]:font-medium group-data-[selected]:text-foreground">
          {x.uri ?? "/"}
        </div>
      </SimpleTooltip>
      <div className="flex gap-2.5 overflow-hidden font-mono text-xs text-muted-foreground">
        <span className="truncate">
          {hasError ? x.error!.message : fmtMs(x.elapsedMs ?? null)}
        </span>
        <span className="whitespace-nowrap">
          req {fmtBytesOrDash(req.wireBytes)}
          {req.encoding && (
            <span className="text-muted-foreground"> ({req.encoding})</span>
          )}
        </span>
        <span className="whitespace-nowrap">
          res {fmtBytesOrDash(res.wireBytes)}
          {res.encoding && (
            <span className="text-muted-foreground"> ({res.encoding})</span>
          )}
        </span>
      </div>
    </button>
  );
}
