import { useCallback, useEffect, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  ArrowUpDown,
  Globe,
  Layers,
  Rows3,
  TableProperties,
} from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@ui/components/ui/toggle-group";
import { useStore } from "@ui/state/store";
import type { Exchange } from "@ui/state/reducer";
import { cn, matchesFilter } from "@ui/lib/utils";
import { ExchangeTable } from "./protospy/exchange-table";
import { ExchangeRow } from "./protospy/exchange-row";
import { ListEmptyState } from "./ListEmptyState";

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
  const timeZone = useStore((s) => s.timeZone);
  const setTimeZone = useStore((s) => s.setTimeZone);
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

  // Radix fires "" when re-clicking the active item in single mode
  // (deselection). Guard so we always have a valid mode.
  function handleListModeChange(v: string) {
    if (v) setListMode(v as "rows" | "table");
  }

  // Rows-mode virtualizer (table mode is virtualized inside ExchangeTable).
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrolledToRef = useRef<number | null>(null);

  // estimateSize is an initial approximation; measureElement measures actual
  // rendered heights via ResizeObserver, so it need not be pixel-exact.
  const estimatedHeight = density === "compact" ? 58 : 74;

  // Always-current reference to ordered, read by getItemKey and the scroll rAF so
  // neither captures a stale closure. See the long-form note that previously lived
  // here (and in git history): reading ordered through a ref keeps getItemKey's
  // identity stable while giving it an up-to-date view.
  const orderedRef = useRef(ordered);
  orderedRef.current = ordered;

  // Include density in the item key so the virtualizer invalidates its measurement
  // cache when density changes (listMode no longer varies the rows-mode row).
  const getItemKey = useCallback(
    (index: number) => `${orderedRef.current[index]?.id ?? index}|${density}`,
    [density],
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

  // Scroll selected row into view on programmatic selection (rows mode only —
  // ExchangeTable owns the equivalent for table mode). See ExchangeTable and git
  // history for why the scroll is deferred one frame and read through orderedRef.
  useEffect(() => {
    if (listMode !== "rows" || selectedId == null) {
      scrolledToRef.current = null;
      return;
    }
    if (scrolledToRef.current === selectedId) return;
    scrolledToRef.current = selectedId;

    const handle = requestAnimationFrame(() => {
      const idx = orderedRef.current.findIndex((ex) => ex.id === selectedId);
      if (idx < 0) return;
      virtualizer.scrollToIndex(idx, { align: "auto" });
    });
    return () => cancelAnimationFrame(handle);
  }, [selectedId, order, filter, traceFilter, listMode, virtualizer]);

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
        <span className="font-ui text-ui-xs font-semibold text-mid tracking-[0.03em]">
          Requests
        </span>
        {traceGroupOn && (
          <Layers
            size={12}
            className="ml-1.5 text-primary"
            aria-label="Trace grouping active"
          />
        )}

        {/* Right: controls */}
        <div className="flex items-center gap-1.5 ml-auto">
          {/* Local/UTC toggle (table mode only) */}
          {listMode === "table" && (
            <button
              onClick={() =>
                setTimeZone(timeZone === "local" ? "utc" : "local")
              }
              className={cn(
                "h-[22px] px-1.5 flex items-center gap-1 rounded text-dim hover:text-ink transition-colors cursor-pointer font-mono text-[10px] uppercase tracking-wider",
                timeZone === "utc" && "text-primary",
              )}
              aria-label={`Time zone: ${timeZone === "utc" ? "UTC" : "Local"}. Click to toggle.`}
              title={
                timeZone === "utc"
                  ? "Showing UTC — click for local time"
                  : "Showing local time — click for UTC"
              }
            >
              <Globe size={11} />
              {timeZone === "utc" ? "UTC" : "Local"}
            </button>
          )}

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
            onValueChange={handleListModeChange}
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

      {/* Content area. Table mode renders ExchangeTable even when empty so its
          column headers stay visible (matching the prior table behaviour); the
          empty-state message renders inside it. Rows mode shows the empty state
          in place of the list. */}
      {listMode === "table" ? (
        <ExchangeTable
          exchanges={ordered}
          selectedId={selectedId}
          tz={timeZone}
          filtered={!!(filter || traceFilter)}
          onSelect={setSelectedId}
        />
      ) : ordered.length === 0 ? (
        <ListEmptyState filtered={!!(filter || traceFilter)} />
      ) : (
        /* Trace rail placeholder + virtualized rows list */
        <div className="flex flex-1 overflow-hidden">
          {hasTraces && <div className="w-3 shrink-0 border-r" aria-hidden />}
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
                    <ExchangeRow
                      exchange={ex}
                      selected={ex.id === selectedId}
                      tz={timeZone}
                      onSelect={() => setSelectedId(ex.id)}
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
