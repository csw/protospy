import { useCallback, useEffect, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowUpDown, Layers, Rows3, TableProperties } from "lucide-react";
import { useStore } from "@ui/state/store";
import type { Exchange } from "@ui/state/reducer";
import {
  formatAbsoluteTime,
  formatSize,
  matchesFilter,
  methodTextClass,
  shortEncoding,
  splitUri,
  statusTextClass,
  traceColor,
} from "@ui/lib/utils";
import { ExchangeListItem } from "./ExchangeListItem";

// Table column widths.
// - Method: covers "OPTIONS" (7 chars mono).
// - Status: fits "200 OK" without truncation.
// - Path: flex 1, with a small minimum so short paths still get space.
// - Time: holds "1234ms".
// - Size: accommodates the worst-case dual size with encoding tag —
//   `1024.0KB/1024.0KB (deflate)`. See PRO-216 comment on PRO-222 for why
//   the previous 76px allocation was too small after dual-size landed.
// - When: holds `HH:MM:SS.mmm` (12 chars + padding).
const TABLE_COLUMNS = "60px 60px minmax(140px, 1fr) 56px 168px 116px";

const EMPTY_STATE_NO_MATCH = "No requests match your filter";

interface TableRowProps {
  exchange: Exchange;
  selected: boolean;
  onSelect: () => void;
  density: "regular" | "compact";
  timeZoneMode: "local" | "utc";
}

function TableRow({
  exchange,
  selected,
  onSelect,
  density,
  timeZoneMode,
}: TableRowProps) {
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
  const hasError = exchange.error != null && exchange.status == null;
  const isUtc = timeZoneMode === "utc";
  const absTime = formatAbsoluteTime(exchange.timestamp, { utc: isUtc });
  // Show both representations in the tooltip so users don't have to toggle to
  // correlate with a log entry recorded in the other zone.
  const localTitle = formatAbsoluteTime(exchange.timestamp, { utc: false });
  const utcTitle = formatAbsoluteTime(exchange.timestamp, { utc: true });
  const timeTitle = `${localTitle} local · ${utcTitle} UTC`;

  const rowHeight = density === "compact" ? 24 : 30;

  const traceBarStyle: React.CSSProperties = exchange.traceId
    ? { borderLeftColor: traceColor(exchange.traceId) }
    : {};

  return (
    <button
      onClick={onSelect}
      className={[
        "w-full text-left grid items-center border-b border-border",
        "border-l-[3px] cursor-pointer transition-colors overflow-hidden",
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
        className={`font-family-mono text-xs px-1 truncate ${
          exchange.status != null
            ? statusTextClass(exchange.status)
            : hasError
              ? "text-red font-semibold"
              : "text-dim"
        }`}
      >
        {exchange.status ?? (hasError ? "ERR" : "—")}
      </span>
      <span
        data-testid="exchange-path"
        className="font-family-mono text-xs text-ink px-1 truncate"
        title={uri}
      >
        {path}
      </span>
      <span className="font-family-mono text-xs text-dim px-1 text-right truncate">
        {exchange.elapsedMs != null ? `${exchange.elapsedMs}ms` : "—"}
      </span>
      <span
        data-testid="exchange-size"
        className="font-family-mono text-xs text-dim px-1 text-right truncate"
        title={sizeTitle}
      >
        {hasDual
          ? `${formatSize(resSize)}/${formatSize(resDecoded)}`
          : formatSize(resSize)}
        {resTag && <span> ({resTag})</span>}
      </span>
      <span
        data-testid="exchange-when"
        className="font-family-mono text-xs text-dim px-2 text-right truncate tabular-nums"
        title={timeTitle}
      >
        {absTime}
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
  const timeZoneMode = useStore((s) => s.timeZoneMode);
  const toggleTimeZoneMode = useStore((s) => s.toggleTimeZoneMode);

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
  // Row heights are empirical: they must match the actual rendered button height for
  // each mode/density combination. browser/exchange-list.spec.ts test 11.3 guards the
  // compact rows value (66px); if fonts or padding change, update both together.
  const rowHeight =
    listMode === "table"
      ? density === "compact"
        ? 24
        : 30
      : density === "compact"
        ? 66
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
            <button
              type="button"
              onClick={toggleTimeZoneMode}
              className="font-family-ui text-ui-xs font-semibold text-mid hover:text-ink uppercase tracking-wider px-2 text-right cursor-pointer transition-colors"
              aria-label={`Time zone: ${timeZoneMode === "utc" ? "UTC" : "local"}. Click to toggle.`}
              title={
                timeZoneMode === "utc"
                  ? "Showing UTC — click for local time"
                  : "Showing local time — click for UTC"
              }
            >
              When ({timeZoneMode === "utc" ? "UTC" : "local"})
            </button>
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
                        key={ex.id}
                        style={{
                          position: "absolute",
                          top: virtualItem.start,
                          width: "100%",
                          height: rowHeight,
                          overflow: "hidden",
                        }}
                      >
                        <TableRow
                          exchange={ex}
                          selected={ex.id === selectedId}
                          onSelect={() => setSelectedId(ex.id)}
                          density={density}
                          timeZoneMode={timeZoneMode}
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
                    key={ex.id}
                    style={{
                      position: "absolute",
                      top: virtualItem.start,
                      width: "100%",
                      height: rowHeight,
                      overflow: "hidden",
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
