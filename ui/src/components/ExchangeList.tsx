import { useCallback, useEffect, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowUpDown, Layers, Rows3, TableProperties } from "lucide-react";
import { useStore } from "@ui/state/store";
import type { Exchange } from "@ui/state/reducer";
import {
  formatSize,
  matchesFilter,
  methodTextClass,
  splitUri,
  statusTextClass,
  traceColor,
} from "@ui/lib/utils";
import { useRelativeTime } from "@ui/hooks/useRelativeTime";
import { ExchangeListItem } from "./ExchangeListItem";

const TABLE_COLUMNS = "60px 48px minmax(120px, 1fr) 56px 76px 64px";

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
  const resSize = exchange.responseBody?.totalBytes ?? 0;

  const rowHeight = density === "compact" ? 24 : 30;

  const traceBarStyle: React.CSSProperties = exchange.traceId
    ? { borderLeftColor: traceColor(exchange.traceId) }
    : {};

  return (
    <button
      onClick={onSelect}
      className={[
        "w-full text-left grid items-center border-b border-border",
        "border-l-[3px] cursor-pointer transition-colors",
        selected
          ? "bg-bg-active border-l-accent"
          : "bg-bg-pane hover:bg-bg-hover",
      ].join(" ")}
      style={{
        gridTemplateColumns: TABLE_COLUMNS,
        height: rowHeight,
        ...(selected ? undefined : traceBarStyle),
      }}
      role="option"
      aria-selected={selected}
    >
      <span
        className={`font-family-mono text-xs uppercase px-2 truncate ${methodTextClass(method)}`}
      >
        {method}
      </span>
      <span
        className={`font-family-mono text-xs px-1 truncate ${exchange.status != null ? statusTextClass(exchange.status) : "text-dim"}`}
      >
        {exchange.status ?? "—"}
      </span>
      <span className="font-family-mono text-xs text-ink px-1 truncate">
        {path}
      </span>
      <span className="font-family-mono text-xs text-dim px-1 text-right truncate">
        {exchange.elapsedMs != null ? `${exchange.elapsedMs}ms` : "—"}
      </span>
      <span className="font-family-mono text-xs text-dim px-1 text-right truncate">
        {formatSize(resSize)}
      </span>
      <span className="font-family-mono text-xs text-dim px-2 text-right truncate">
        {relTime}
      </span>
    </button>
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
  const rowHeight =
    listMode === "table"
      ? density === "compact"
        ? 24
        : 30
      : density === "compact"
        ? 58
        : 74;

  // Include rowHeight in item keys so the virtualizer's internal
  // getMeasurements memo invalidates when mode or density changes.
  // Without this, estimateSize updates don't bust the measurement
  // cache and rows render at stale positions.
  //
  // `ordered` is intentionally excluded from deps: it rebuilds every
  // render, so including it would give getItemKey a new reference each
  // time, defeating the virtualizer's measurement cache entirely.
  const getItemKey = useCallback(
    (index: number) => `${ordered[index]?.id ?? index}|${rowHeight}`,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rowHeight],
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
    estimateSize: () => rowHeight,
    getItemKey,
    overscan: 5,
  });

  // Scroll selected item into view when selectedId changes
  useEffect(() => {
    if (selectedId == null) return;
    const idx = ordered.findIndex((ex) => ex.id === selectedId);
    if (idx >= 0) {
      virtualizer.scrollToIndex(idx, { align: "auto" });
    }
    // ordered is rebuilt each render — comparing by identity would always re-run
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

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
        <span className="font-family-ui text-ui-xs font-semibold text-mid uppercase tracking-widest">
          Exchanges
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

          {/* Rows/Table segmented control */}
          <div className="flex border border-border rounded overflow-hidden">
            <button
              onClick={() => setListMode("rows")}
              className={[
                "w-[22px] h-[22px] flex items-center justify-center cursor-pointer transition-colors",
                listMode === "rows"
                  ? "bg-bg-pane text-ink"
                  : "text-dim hover:text-ink",
              ].join(" ")}
              aria-label="Rows mode"
              aria-pressed={listMode === "rows"}
              title="Rows"
            >
              <Rows3 size={13} />
            </button>
            <button
              onClick={() => setListMode("table")}
              className={[
                "w-[22px] h-[22px] flex items-center justify-center cursor-pointer transition-colors",
                listMode === "table"
                  ? "bg-bg-pane text-ink"
                  : "text-dim hover:text-ink",
              ].join(" ")}
              aria-label="Table mode"
              aria-pressed={listMode === "table"}
              title="Table"
            >
              <TableProperties size={13} />
            </button>
          </div>
        </div>
      </div>

      {/* Content area */}
      {listMode === "table" ? (
        <>
          {/* Sticky table header */}
          <div
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
            <div className="flex-1 flex items-center justify-center bg-bg-pane">
              <span className="font-family-ui text-xs text-dim uppercase tracking-widest">
                {filter || traceFilter ? "No exchanges match" : "No exchanges"}
              </span>
            </div>
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
                aria-label="Exchanges"
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
                        key={ex.id}
                        style={{
                          position: "absolute",
                          top: virtualItem.start,
                          width: "100%",
                          height: rowHeight,
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
        <div className="flex-1 flex items-center justify-center bg-bg-pane">
          <span className="font-family-ui text-xs text-dim uppercase tracking-widest">
            {filter || traceFilter ? "No exchanges match" : "No exchanges"}
          </span>
        </div>
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
            aria-label="Exchanges"
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
                    key={ex.id}
                    style={{
                      position: "absolute",
                      top: virtualItem.start,
                      width: "100%",
                      height: rowHeight,
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
