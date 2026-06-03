import { useCallback, useEffect, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowUpDown, Layers, Rows3, TableProperties } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@ui/components/ui/toggle-group";
import { useStore } from "@ui/state/store";
import type { Exchange } from "@ui/state/reducer";
import {
  cn,
  formatSize,
  matchesFilter,
  methodTextClass,
  shortEncoding,
  splitUri,
  statusTextClass,
  traceColor,
} from "@ui/lib/utils";
import { useRelativeTime } from "@ui/hooks/useRelativeTime";
import { ExchangeListItem } from "./ExchangeListItem";
import { SimpleTooltip } from "./ui/SimpleTooltip";

const TABLE_COLUMNS = "60px 48px minmax(120px, 1fr) 56px 76px 64px";

const EMPTY_STATE_NO_MATCH = "No requests match your filter";

interface TableRowProps {
  exchange: Exchange;
  selected: boolean;
  onSelect: () => void;
  density: "regular" | "compact";
}

function TableRow({ exchange, selected, onSelect, density }: TableRowProps) {
  const relTime = useRelativeTime(exchange.timestamp);
  const method = exchange.method ?? "?";
  const uri = exchange.uri ?? "/";
  const { path } = splitUri(uri);
  const resSize = exchange.responseBody?.wireBytes ?? 0;
  const resEncoding = exchange.responseBody?.contentEncoding;
  const resDecoded = exchange.responseBody?.decodedBytes;
  const resTag = shortEncoding(resEncoding);
  const hasDual =
    resTag != null && resDecoded != null && resDecoded !== resSize;
  const sizeTitle = resTag
    ? hasDual
      ? `${formatSize(resSize)} on the wire / ${formatSize(resDecoded)} after decompression (${resEncoding})`
      : `${formatSize(resSize)} on the wire (${resEncoding}; decoded size unknown until body is opened)`
    : undefined;

  const traceBarStyle: React.CSSProperties = exchange.traceId
    ? { borderLeftColor: traceColor(exchange.traceId) }
    : {};

  const heightClass = density === "compact" ? "h-6" : "h-[30px]";

  return (
    <button
      onClick={onSelect}
      className={cn(
        "w-full text-left grid items-center border-b border-border",
        "border-l-[3px] cursor-pointer transition-colors overflow-hidden",
        heightClass,
        selected
          ? "bg-bg-active border-l-accent"
          : "bg-bg-pane hover:bg-bg-hover",
      )}
      style={{
        gridTemplateColumns: TABLE_COLUMNS,
        ...(selected ? undefined : traceBarStyle),
      }}
      role="option"
      aria-selected={selected}
    >
      <span
        className={cn(
          "font-family-mono text-xs uppercase px-2 truncate",
          methodTextClass(method),
        )}
      >
        {method}
      </span>
      <span
        className={cn(
          "font-family-mono text-xs px-1 truncate",
          exchange.status != null
            ? statusTextClass(exchange.status)
            : "text-dim",
        )}
      >
        {exchange.status ?? "—"}
      </span>
      <SimpleTooltip content={uri}>
        <span className="font-family-mono text-xs text-ink px-1 truncate">
          {path}
        </span>
      </SimpleTooltip>
      <span className="font-family-mono text-xs text-dim px-1 text-right truncate">
        {exchange.elapsedMs != null ? `${exchange.elapsedMs}ms` : "—"}
      </span>
      <span
        className="font-family-mono text-xs text-dim px-1 text-right truncate"
        title={sizeTitle}
      >
        {hasDual
          ? `${formatSize(resSize)}/${formatSize(resDecoded)}`
          : formatSize(resSize)}
        {resTag && <span> ({resTag})</span>}
      </span>
      <span className="font-family-mono text-xs text-dim px-2 text-right truncate">
        {relTime}
      </span>
    </button>
  );
}

function ListEmptyState({ filtered }: { filtered: boolean }) {
  return (
    <div className="flex-1 flex items-center justify-center bg-bg-pane">
      {filtered ? (
        <span className="font-family-ui text-xs text-dim">
          {EMPTY_STATE_NO_MATCH}
        </span>
      ) : (
        <div className="flex flex-col items-center gap-1.5 text-center max-w-[260px]">
          <span className="font-family-ui text-sm font-medium text-ink-2">
            No requests yet
          </span>
          <span className="font-family-ui text-xs text-dim leading-relaxed">
            Traffic will appear here when requests flow through the proxy
          </span>
        </div>
      )}
    </div>
  );
}

export function ExchangeList() {
  const exchanges = useStore((s) => s.exchanges);
  const ids = useStore((s) => s.ids);
  const selectedId = useStore((s) => s.selectedId);
  const setSelectedId = useStore((s) => s.setSelectedId);
  const filter = useStore((s) => s.filter);
  const traceFilter = useStore((s) => s.traceFilter);
  const order = useStore((s) => s.order);
  const setOrder = useStore((s) => s.setOrder);
  const density = useStore((s) => s.density);
  const listMode = useStore((s) => s.listMode);
  const setListMode = useStore((s) => s.setListMode);
  const traceGroupOn = useStore((s) => s.traceGroupOn);
  const cmdKOpen = useStore((s) => s.cmdKOpen);
  const setCmdKOpen = useStore((s) => s.setCmdKOpen);

  // Derive filtered + ordered list
  const filtered = ids
    .map((id) => exchanges.get(id))
    .filter((ex): ex is Exchange => ex != null)
    .filter((ex) => matchesFilter(ex, filter))
    .filter((ex) => traceFilter == null || ex.traceId === traceFilter);

  const ordered = order === "newest" ? [...filtered].reverse() : filtered;

  // Whether any visible exchange has a traceId (for trace rail placeholder)
  const hasTraces = ordered.some((ex) => ex.traceId != null);

  // Virtualizer setup
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrolledToRef = useRef<number | null>(null);

  // Estimate sizes are initial approximations; measureElement measures actual
  // rendered heights via ResizeObserver, so these don't need to be pixel-exact.
  const estimatedHeight =
    listMode === "table"
      ? density === "compact"
        ? 24
        : 30
      : density === "compact"
        ? 66
        : 74;

  // Include listMode and density in item keys so the virtualizer invalidates
  // its measurement cache when mode or density changes. Without this, stale
  // measurements persist and rows render at wrong positions.
  //
  // `ordered` is intentionally excluded from deps: it rebuilds every
  // render, so including it would give getItemKey a new reference each
  // time, defeating the virtualizer's measurement cache entirely.
  const getItemKey = useCallback(
    (index: number) => `${ordered[index]?.id ?? index}|${listMode}|${density}`,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [listMode, density],
  );

  // React Compiler bails out on useVirtualizer (`react-hooks/incompatible-library`)
  // because its methods close over mutable instance state. Safe to ignore here:
  // we don't enable the compiler in this build, and the returned methods are
  // only invoked inline or inside an effect that captures this render's instance —
  // they're never handed to a memoized child.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: ordered.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => estimatedHeight,
    getItemKey,
    overscan: 5,
  });

  // Scroll selected item into view on programmatic selection.
  //
  // Fires when selectedId, order, filter, traceFilter, or listMode
  // changes. The first triggers a new selection; the rest shift the
  // selected row's position in the list without changing the selection
  // itself, so the guard must be reset to allow a re-scroll.
  //
  // Uses requestAnimationFrame to defer the scroll by one frame: on
  // the initial render with data, the virtualizer hasn't established
  // its scroll observation on the freshly-mounted container element
  // yet, so a synchronous scrollToIndex silently no-ops. Deferring by
  // one frame lets the browser complete layout first.
  //
  // The index is re-derived inside the rAF callback from the current
  // `ordered` snapshot to avoid a stale-index race: a new exchange
  // arriving in the one-frame window could shift indices.
  //
  // `align: "auto"` only scrolls when the target is outside the
  // visible viewport, so user-initiated clicks (which require the row
  // to already be visible) don't cause jarring scroll jumps.
  //
  // `ordered` is intentionally omitted from deps — it rebuilds every
  // render, so including it would fire the effect on every render.
  // The `scrolledToRef` guard prevents redundant scrolls when the
  // same selectedId persists across re-renders.
  useEffect(() => {
    if (selectedId == null) {
      scrolledToRef.current = null;
      return;
    }

    // Guard: don't re-scroll if we already scrolled to this selection
    // and the deps that affect position haven't changed (React re-runs
    // the effect when they do, clearing the guard implicitly).
    if (scrolledToRef.current === selectedId) return;
    scrolledToRef.current = selectedId;

    const handle = requestAnimationFrame(() => {
      // Re-derive index at frame time from the current closure's
      // `ordered` to avoid stale-index if data arrived mid-frame.
      const idx = ordered.findIndex((ex) => ex.id === selectedId);
      if (idx < 0) return;
      virtualizer.scrollToIndex(idx, { align: "auto" });
    });
    return () => cancelAnimationFrame(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, order, filter, traceFilter, listMode]);

  // j/k/↑/↓ keyboard navigation over the filtered+ordered list
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // ⌘K / Ctrl+K: toggle command palette
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCmdKOpen(!cmdKOpen);
        return;
      }

      // Skip navigation when focus is in an input or command palette is open
      const target = e.target;
      if (
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (cmdKOpen) return;

      // j/↓: next; k/↑: previous (in the filtered+ordered list)
      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        if (ordered.length === 0) return;
        const effectiveId = selectedId ?? ordered[0]?.id ?? null;
        if (effectiveId == null) return;
        const idx = ordered.findIndex((ex) => ex.id === effectiveId);
        const next = idx < ordered.length - 1 ? ordered[idx + 1] : null;
        if (next != null) setSelectedId(next.id);
      } else if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        if (ordered.length === 0) return;
        const effectiveId = selectedId ?? ordered[0]?.id ?? null;
        if (effectiveId == null) return;
        const idx = ordered.findIndex((ex) => ex.id === effectiveId);
        const prev = idx > 0 ? ordered[idx - 1] : null;
        if (prev != null) setSelectedId(prev.id);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [ordered, selectedId, setSelectedId, cmdKOpen, setCmdKOpen]);

  return (
    <div className="flex flex-col h-full overflow-hidden border-r border-border">
      {/* Toolbar */}
      <div className="flex items-center px-3 h-[30px] shrink-0 bg-bg-sub border-b border-border">
        {/* Left: label + trace group indicator */}
        <span className="font-family-ui text-ui-xs font-semibold text-mid tracking-[0.03em]">
          Requests
        </span>
        {traceGroupOn && (
          <Layers
            size={12}
            className="ml-1.5 text-accent"
            aria-label="Trace grouping active"
          />
        )}

        {/* Right: controls */}
        <div className="flex items-center gap-1.5 ml-auto">
          {/* Order toggle */}
          <button
            onClick={() => setOrder(order === "newest" ? "oldest" : "newest")}
            className="w-[22px] h-[22px] flex items-center justify-center rounded text-dim hover:text-ink transition-colors cursor-pointer"
            aria-label={`Sort order: ${order}. Click to toggle.`}
            title={order === "newest" ? "Newest first" : "Oldest first"}
          >
            <ArrowUpDown size={13} />
          </button>

          {/* Rows/Table toggle group */}
          <ToggleGroup
            type="single"
            value={listMode}
            onValueChange={(v) => {
              // Radix fires "" when re-clicking the active item in single
              // mode (deselection). Guard so we always have a valid mode.
              if (v) setListMode(v as "rows" | "table");
            }}
            bordered
            size="sm"
            aria-label="List mode"
          >
            <ToggleGroupItem value="rows" aria-label="Rows mode" title="Rows">
              <Rows3 size={13} />
            </ToggleGroupItem>
            <ToggleGroupItem
              value="table"
              aria-label="Table mode"
              title="Table"
            >
              <TableProperties size={13} />
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      </div>

      {/* Content area */}
      {listMode === "table" ? (
        <>
          {/* Sticky table header */}
          <div
            data-testid="exchange-table-header"
            className="grid shrink-0 h-[26px] items-center bg-bg-sub border-b border-border border-l-[3px] border-l-transparent sticky top-0 z-[2]"
            style={{ gridTemplateColumns: TABLE_COLUMNS }}
          >
            <span className="font-family-ui text-ui-xs font-semibold text-mid uppercase tracking-wider px-2">
              Method
            </span>
            <span className="font-family-ui text-ui-xs font-semibold text-mid uppercase tracking-wider px-1">
              Status
            </span>
            <span className="font-family-ui text-ui-xs font-semibold text-mid uppercase tracking-wider px-1">
              Path
            </span>
            <span className="font-family-ui text-ui-xs font-semibold text-mid uppercase tracking-wider px-1 text-right">
              Time
            </span>
            <span className="font-family-ui text-ui-xs font-semibold text-mid uppercase tracking-wider px-1 text-right">
              Size
            </span>
            <span className="font-family-ui text-ui-xs font-semibold text-mid uppercase tracking-wider px-2 text-right">
              When
            </span>
          </div>

          {ordered.length === 0 ? (
            <ListEmptyState filtered={!!(filter || traceFilter)} />
          ) : (
            /* Trace rail + virtualized table rows */
            <div className="flex flex-1 overflow-hidden">
              {/* Trace rail placeholder */}
              {hasTraces && (
                <div className="w-3 shrink-0 bg-bg-pane border-r border-border" />
              )}
              {/* Scrollable rows */}
              <div
                ref={scrollRef}
                role="listbox"
                aria-label="Requests"
                className="flex-1 overflow-y-auto overflow-x-hidden bg-bg-pane"
              >
                <div
                  style={{
                    height: virtualizer.getTotalSize(),
                    position: "relative",
                  }}
                >
                  {virtualizer.getVirtualItems().map((virtualItem) => {
                    const ex = ordered[virtualItem.index];
                    return (
                      <div
                        key={virtualItem.key}
                        ref={virtualizer.measureElement}
                        data-index={virtualItem.index}
                        style={{
                          position: "absolute",
                          top: 0,
                          left: 0,
                          width: "100%",
                          transform: `translateY(${virtualItem.start}px)`,
                        }}
                      >
                        <TableRow
                          exchange={ex}
                          selected={ex.id === selectedId}
                          onSelect={() => setSelectedId(ex.id)}
                          density={density}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </>
      ) : ordered.length === 0 ? (
        <ListEmptyState filtered={!!(filter || traceFilter)} />
      ) : (
        /* Trace rail + virtualized scrollable list */
        <div className="flex flex-1 overflow-hidden">
          {/* Trace rail placeholder */}
          {hasTraces && (
            <div className="w-3 shrink-0 bg-bg-pane border-r border-border" />
          )}
          {/* Scrollable list */}
          <div
            ref={scrollRef}
            role="listbox"
            aria-label="Requests"
            className="flex-1 overflow-y-auto overflow-x-hidden bg-bg-pane"
          >
            <div
              style={{
                height: virtualizer.getTotalSize(),
                position: "relative",
              }}
            >
              {virtualizer.getVirtualItems().map((virtualItem) => {
                const ex = ordered[virtualItem.index];
                return (
                  <div
                    key={virtualItem.key}
                    ref={virtualizer.measureElement}
                    data-index={virtualItem.index}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      transform: `translateY(${virtualItem.start}px)`,
                    }}
                  >
                    <ExchangeListItem
                      exchange={ex}
                      selected={ex.id === selectedId}
                      onSelect={() => setSelectedId(ex.id)}
                      density={density}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
