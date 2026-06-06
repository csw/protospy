// src/components/protospy/exchange-table.tsx — DEFAULT list view.
// Headless @tanstack/react-table owns columns/sort/sizing; we render the rows and
// virtualize them with @tanstack/react-virtual. The TraceRail sits to the left and
// is fed the virtualizer's row offsets so its bars line up with (possibly
// off-screen) rows.
//
// Columns (handoff, fixed order): Method · Status · Path · Elapsed · Size · Time.
//   - Status = numeric code only (rows mode shows the full line).
//   - Size   = response WIRE size + compression marker (tooltip: wire/decoded/enc).
//   - Time   = absolute HH:MM:SS.mmm, honouring the Local/UTC toggle.
//   - Fixed metadata never truncates; only Path truncates.

"use client";

import { useMemo, useRef } from "react";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { traceColorVar } from "@/lib/tokens";
import { fmtBytes, fmtMs, fmtClock } from "@/lib/format";
import { useDensity } from "@/lib/density";
import type { Exchange } from "@/lib/types";
import { MethodBadge } from "./method-badge";
import { StatusCode } from "./status-code";
import { TraceRail } from "./trace-rail";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const col = createColumnHelper<Exchange>();

function SizeCell({ x }: { x: Exchange }) {
  const res = x.response;
  if (!res) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="inline-flex items-center gap-1.5">
      {fmtBytes(res.wireBytes)}
      {res.encoding && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="rounded-[3px] border bg-secondary px-1 text-[9px] font-semibold text-muted-foreground">
              {res.encoding}
            </span>
          </TooltipTrigger>
          <TooltipContent>
            {fmtBytes(res.wireBytes)} wire /{" "}
            {res.decodedBytes != null ? fmtBytes(res.decodedBytes) : "?"}{" "}
            decoded ({res.encoding})
          </TooltipContent>
        </Tooltip>
      )}
    </span>
  );
}

export interface ExchangeTableProps {
  exchanges: Exchange[];
  selectedId: number | null;
  tz?: "local" | "utc";
  activeTraceId?: string | null;
  onSelect?: (id: number) => void;
  onHoverTrace?: (traceId: string | null) => void;
  onSelectTrace?: (traceId: string) => void;
}

export function ExchangeTable({
  exchanges,
  selectedId,
  tz = "local",
  activeTraceId,
  onSelect,
  onHoverTrace,
  onSelectTrace,
}: ExchangeTableProps) {
  const { rowPx } = useDensity();
  const [sorting, setSorting] = useState<SortingState>([]);

  const columns = useMemo(
    () => [
      col.accessor("method", {
        header: "Method",
        size: 56,
        cell: (c) => <MethodBadge method={c.getValue()} />,
      }),
      col.accessor("status", {
        header: "Status",
        size: 54,
        cell: (c) => (
          <StatusCode
            status={c.getValue()}
            hasError={c.row.original.error != null}
          />
        ),
      }),
      col.accessor("uri", {
        header: "Path",
        size: 0, // flex column
        cell: (c) => <span className="block truncate">{c.getValue()}</span>,
      }),
      col.accessor("elapsedMs", {
        header: "Elapsed",
        size: 62,
        cell: (c) => fmtMs(c.getValue()),
      }),
      col.display({
        id: "size",
        header: "Size",
        size: 88,
        cell: (c) => <SizeCell x={c.row.original} />,
      }),
      col.accessor("startedAt", {
        header: "Time",
        size: 100,
        cell: (c) => fmtClock(c.getValue(), tz),
      }),
    ],
    [tz],
  );

  // PRO-341: React Compiler bails out on useReactTable
  // (`react-hooks/incompatible-library`) because TanStack Table returns methods
  // that close over mutable instance state. Safe to ignore here, matching the
  // repo's useVirtualizer call sites (ExchangeList/EventsView/JsonViewer): the
  // compiler is not enabled in this build, and the returned API is consumed
  // inline rather than handed to a memoized child.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: exchanges,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const rows = table.getRowModel().rows;
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowPx.table,
    overscan: 12,
  });

  const traceIds = useMemo(() => rows.map((r) => r.original.traceId), [rows]);

  // Grid template shared by header + rows. Path (col 3) is the only flexible one.
  const gridCols = "56px 54px minmax(110px,1fr) 62px 88px 100px";

  return (
    <div className="flex min-h-0 flex-1">
      <TraceRail
        traceIds={traceIds}
        rowTop={(i) =>
          virtualizer.getVirtualItems().find((v) => v.index === i)?.start ??
          i * rowPx.table
        }
        rowBottom={(i) =>
          virtualizer.getVirtualItems().find((v) => v.index === i)?.end ??
          (i + 1) * rowPx.table
        }
        activeTraceId={activeTraceId}
        onHoverTrace={onHoverTrace}
        onSelectTrace={onSelectTrace}
      />
      <div ref={scrollRef} className="min-w-0 flex-1 overflow-auto font-mono">
        {/* sticky header */}
        <div
          className="sticky top-0 z-10 grid h-[26px] items-center gap-2 border-b bg-secondary px-3 font-sans text-xs font-semibold uppercase tracking-wide text-muted-foreground"
          style={{ gridTemplateColumns: gridCols }}
        >
          {table.getFlatHeaders().map((h) => (
            <button
              key={h.id}
              type="button"
              onClick={h.column.getToggleSortingHandler()}
              className="flex items-center gap-1 text-left"
            >
              {flexRender(h.column.columnDef.header, h.getContext())}
              {{ asc: "↑", desc: "↓" }[h.column.getIsSorted() as string] ?? ""}
            </button>
          ))}
        </div>

        <div
          className="relative"
          style={{ height: virtualizer.getTotalSize() }}
        >
          {virtualizer.getVirtualItems().map((vi) => {
            const x = rows[vi.index].original;
            const selected = x.id === selectedId;
            return (
              <button
                key={x.id}
                type="button"
                onClick={() => onSelect?.(x.id)}
                onMouseEnter={() => x.traceId && onHoverTrace?.(x.traceId)}
                data-selected={selected || undefined}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: vi.size,
                  transform: `translateY(${vi.start}px)`,
                  gridTemplateColumns: gridCols,
                  ...(x.traceId
                    ? ({
                        "--trace-color": traceColorVar(x.traceId),
                      } as React.CSSProperties)
                    : {}),
                }}
                className={cn(
                  "grid items-center gap-2 border-b px-3 text-left text-sm text-secondary-foreground",
                  "hover:bg-hover data-[selected]:bg-accent",
                  x.traceId &&
                    "after:absolute after:inset-y-0 after:left-0 after:w-1 after:bg-[--trace-color]",
                  x.error && "shadow-[inset_3px_0_0_var(--error)]",
                )}
              >
                {rows[vi.index].getVisibleCells().map((cell) => (
                  <span key={cell.id} className="min-w-0 whitespace-nowrap">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </span>
                ))}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
