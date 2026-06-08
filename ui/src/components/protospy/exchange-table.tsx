// src/components/protospy/exchange-table.tsx — DEFAULT list view.
// Headless @tanstack/react-table owns columns/sort/sizing; we render the rows and
// virtualize them with @tanstack/react-virtual. A trace-rail gutter is reserved on
// the left when any visible exchange carries a trace; the lane-packed rail itself
// lands in Slice 1b (PRO-356), which relocates it into this scroll container.
//
// Columns (handoff, fixed order): Method · Status · Path · Elapsed · Size · Time.
//   - Status = numeric code only (rows mode shows the full line).
//   - Size   = response WIRE size + compression marker (tooltip: wire/decoded/enc).
//   - Time   = absolute HH:MM:SS.mmm, honouring the Local/UTC toggle.
//   - Fixed metadata never truncates; only Path truncates.
//
// Consumes the live `Exchange` (PRO-359) through the consumed-interface helpers in
// `lib/exchange.ts`: string status, ISO `timestamp`, `BodyState` size/encoding.

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { FileArchive } from "lucide-react";
import { observeElementRectWithFallback } from "@ui/lib/virtual";
import { cn, formatAbsoluteTime, splitUri } from "@ui/lib/utils";
import type { TimeZone } from "@ui/lib/utils";
import { fmtBytes, fmtMs } from "@ui/lib/format";
import { responseSizeView } from "@ui/lib/exchange";
import { traceTokenIndex } from "@ui/lib/tokens";
import { useDensity } from "@ui/lib/density";
import type { Exchange } from "@ui/state/reducer";
import { MethodBadge } from "./method-badge";
import { StatusCode } from "./status-code";
import { ListEmptyState } from "../ListEmptyState";
import { SimpleTooltip } from "@ui/components/ui/SimpleTooltip";

const col = createColumnHelper<Exchange>();

// SIZE = response wire size (bounded `fmtBytes`) + a compression-marker icon when
// the body is encoded; the wire/decoded breakdown lives in the cell's tooltip
// (kept deviation §2/§3). The single bounded value keeps the fixed track from
// truncating (PRO-286).
function SizeCell({ x }: { x: Exchange }) {
  const { wireBytes, encoding, tooltip } = responseSizeView(x);
  if (wireBytes == null)
    return <span className="text-muted-foreground">—</span>;
  return (
    <span
      className="flex items-center justify-end gap-1 overflow-hidden"
      title={tooltip}
    >
      {encoding && <FileArchive className="size-3 shrink-0" aria-hidden />}
      <span className="truncate">{fmtBytes(wireBytes)}</span>
    </span>
  );
}

export interface ExchangeTableProps {
  exchanges: Exchange[];
  selectedId: number | null;
  tz?: TimeZone;
  /** Whether a filter is active — picks the empty-state copy when there are no rows. */
  filtered?: boolean;
  onSelect?: (id: number) => void;
}

export function ExchangeTable({
  exchanges,
  selectedId,
  tz = "local",
  filtered = false,
  onSelect,
}: ExchangeTableProps) {
  const { density, rowPx } = useDensity();
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
        cell: (c) => {
          const ex = c.row.original;
          return (
            <StatusCode
              status={c.getValue()}
              hasError={ex.error != null}
              title={ex.error != null ? ex.error.message : ex.status}
            />
          );
        },
      }),
      col.accessor("uri", {
        header: "Path",
        size: 0, // flex column
        cell: (c) => {
          const uri = c.getValue() ?? "/";
          return (
            <SimpleTooltip content={uri}>
              <span className="block min-w-0 truncate">
                {splitUri(uri).path}
              </span>
            </SimpleTooltip>
          );
        },
      }),
      col.accessor("elapsedMs", {
        header: "Elapsed",
        size: 62,
        cell: (c) => (
          <span className="min-w-0 whitespace-nowrap">
            {fmtMs(c.getValue() ?? null)}
          </span>
        ),
      }),
      col.display({
        id: "size",
        header: "Size",
        size: 96,
        cell: (c) => <SizeCell x={c.row.original} />,
      }),
      col.accessor("timestamp", {
        header: "Time",
        size: 104,
        cell: (c) => (
          <span className="min-w-0 whitespace-nowrap">
            {formatAbsoluteTime(c.getValue(), tz)}
          </span>
        ),
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
    // Key by density so a density change invalidates the cached row heights
    // (table rows are fixed-height per density; no per-row measurement).
    getItemKey: (index) => `${rows[index]?.original.id ?? index}|${density}`,
    overscan: 12,
    observeElementRect: observeElementRectWithFallback,
  });

  const hasTraces = useMemo(
    () => exchanges.some((x) => x.traceId != null),
    [exchanges],
  );

  // Scroll the selected row into view on programmatic selection (j/k nav, command
  // palette). Deferred by one frame for the same reason ExchangeList does it: the
  // virtualizer hasn't established scroll observation on a freshly-mounted element,
  // so a synchronous scrollToIndex no-ops. Guarded so a persistent selection across
  // re-renders doesn't re-scroll; `align: "auto"` leaves an already-visible row put.
  const scrolledToRef = useRef<number | null>(null);
  useEffect(() => {
    if (selectedId == null) {
      scrolledToRef.current = null;
      return;
    }
    if (scrolledToRef.current === selectedId) return;
    const idx = rows.findIndex((r) => r.original.id === selectedId);
    if (idx < 0) return;
    scrolledToRef.current = selectedId;
    const handle = requestAnimationFrame(() =>
      virtualizer.scrollToIndex(idx, { align: "auto" }),
    );
    return () => cancelAnimationFrame(handle);
  }, [selectedId, rows, virtualizer]);

  // Grid template shared by header + rows. Path (col 3) is the only flexible one.
  const gridCols = "56px 54px minmax(110px,1fr) 62px 96px 104px";

  return (
    <div className="flex min-h-0 flex-1">
      {/* Trace-rail gutter (placeholder until Slice 1b mounts the lane-packed rail). */}
      {hasTraces && <div className="w-3 shrink-0 border-r" aria-hidden />}
      <div ref={scrollRef} className="min-w-0 flex-1 overflow-auto font-mono">
        {/* sticky header */}
        <div
          data-testid="exchange-table-header"
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

        {/* The listbox wraps a total-height spacer (matching rows mode), so the
            sticky header stays outside the option group and tooling that reads
            the virtual container height finds it as the listbox's first child. */}
        <div role="listbox" aria-label="Requests">
          {exchanges.length === 0 ? (
            <ListEmptyState filtered={filtered} />
          ) : (
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
                    role="option"
                    aria-selected={selected}
                    onClick={() => onSelect?.(x.id)}
                    data-selected={selected || undefined}
                    data-trace={
                      x.traceId ? traceTokenIndex(x.traceId) : undefined
                    }
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      height: vi.size,
                      transform: `translateY(${vi.start}px)`,
                      gridTemplateColumns: gridCols,
                    }}
                    className={cn(
                      "relative grid items-center gap-2 border-b px-3 text-left text-sm text-secondary-foreground",
                      "hover:bg-hover data-[selected]:bg-accent",
                      x.traceId &&
                        "after:absolute after:inset-y-0 after:left-0 after:w-1 after:bg-(--trace-color)",
                      x.error && "shadow-[inset_3px_0_0_var(--error)]",
                    )}
                  >
                    {/* Cells render as direct grid children (one per track) so
                        each cell's own element carries its styling/attributes. */}
                    {rows[vi.index].getVisibleCells().map((cell) => (
                      <Fragment key={cell.id}>
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </Fragment>
                    ))}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
