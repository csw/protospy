// src/components/protospy/trace-group.tsx
// Group-by-trace list presentation (the grouped display mode, gated by the
// store's `traceGroupOn`). A multi-member trace collapses into a card — trace
// color, short id, request count, summary (total elapsed) — with collapse/expand;
// single-member traces stay flat at their chronological position. Prop-driven
// like the other list views; app-shell feeds it the already filtered+ordered set.

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { traceColorVar, shortTraceId } from "@/lib/tokens";
import { fmtMs } from "@/lib/format";
// v2.4 ingest (PRO-363): bind to the live reducer Exchange model (the adapted
// `ExchangeRow` consumes it), not the scaffold `lib/types` model.
import type { Exchange } from "@ui/state/reducer";
import { ExchangeRow } from "./exchange-row";

export interface TraceGroupProps {
  traceId: string;
  members: Exchange[]; // in list order
  selectedId: number | null;
  tz?: "local" | "utc";
  defaultOpen?: boolean;
  onSelect?: (id: number) => void;
  onHoverTrace?: (traceId: string | null) => void;
  onFilterTrace?: (traceId: string) => void;
}

export function TraceGroup({
  traceId,
  members,
  selectedId,
  tz = "local",
  defaultOpen = true,
  onSelect,
  onHoverTrace,
  onFilterTrace,
}: TraceGroupProps) {
  const [open, setOpen] = useState(defaultOpen);
  const total = members.reduce((a, m) => a + (m.elapsedMs ?? 0), 0);
  const color = traceColorVar(traceId);

  return (
    <div
      className="border-b border-l-[3px]"
      style={{ borderLeftColor: color } as React.CSSProperties}
      onMouseEnter={() => onHoverTrace?.(traceId)}
    >
      <div className="flex h-[30px] items-center gap-2 bg-secondary pl-2.5 pr-3 font-mono text-xs text-muted-foreground">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label={open ? "Collapse trace" : "Expand trace"}
          className="inline-flex items-center gap-1.5 text-secondary-foreground hover:text-foreground"
        >
          <ChevronRight
            className={cn(
              "size-3.5 text-muted-foreground transition-transform",
              open && "rotate-90",
            )}
          />
          <span
            className="size-2.5 rounded-[3px]"
            style={{ background: color }}
            aria-hidden
          />
        </button>
        <button
          type="button"
          onClick={() => onFilterTrace?.(traceId)}
          aria-label={`Filter to trace ${shortTraceId(traceId)}`}
          className="hover:text-foreground"
        >
          trace {shortTraceId(traceId)}
        </button>
        <span className="text-secondary-foreground">
          · {members.length} requests
        </span>
        <span>· {fmtMs(total)} total</span>
      </div>

      {open && (
        <div>
          {members.map((m) => (
            <ExchangeRow
              key={m.id}
              exchange={m}
              selected={m.id === selectedId}
              tz={tz}
              onSelect={() => onSelect?.(m.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** Arrange a filtered+ordered exchange list into trace groups (multi-member) and
 *  flat singletons. A trace becomes a card the first time a member appears; its
 *  members are gathered in list order. Singletons render as plain rows. */
export interface GroupedExchangeListProps {
  exchanges: Exchange[];
  selectedId: number | null;
  tz?: "local" | "utc";
  onSelect?: (id: number) => void;
  onHoverTrace?: (traceId: string | null) => void;
  onFilterTrace?: (traceId: string) => void;
}

export function GroupedExchangeList({
  exchanges,
  selectedId,
  tz = "local",
  onSelect,
  onHoverTrace,
  onFilterTrace,
}: GroupedExchangeListProps) {
  // Single O(n) pass collecting each trace's members in list order. Reused for
  // both the multi-member test and the per-card member list, so no trace is
  // re-scanned with a nested filter.
  const byTrace = new Map<string, Exchange[]>();
  for (const x of exchanges) {
    if (x.traceId == null) continue;
    const arr = byTrace.get(x.traceId);
    if (arr) arr.push(x);
    else byTrace.set(x.traceId, [x]);
  }

  const isGrouped = (x: Exchange) =>
    x.traceId != null && (byTrace.get(x.traceId)?.length ?? 0) > 1;
  const seen = new Set<string>();

  return (
    <div
      className="min-h-0 flex-1 overflow-auto"
      onMouseLeave={() => onHoverTrace?.(null)}
    >
      {exchanges.map((x) => {
        if (isGrouped(x)) {
          if (seen.has(x.traceId!)) return null; // members rendered inside the card
          seen.add(x.traceId!);
          const members = byTrace.get(x.traceId!)!;
          return (
            <TraceGroup
              key={`g-${x.traceId}`}
              traceId={x.traceId!}
              members={members}
              selectedId={selectedId}
              tz={tz}
              onSelect={onSelect}
              onHoverTrace={onHoverTrace}
              onFilterTrace={onFilterTrace}
            />
          );
        }
        return (
          <ExchangeRow
            key={x.id}
            exchange={x}
            selected={x.id === selectedId}
            tz={tz}
            onSelect={() => onSelect?.(x.id)}
          />
        );
      })}
    </div>
  );
}
