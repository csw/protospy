import { useEffect, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowUpDown, Rows3, TableProperties } from "lucide-react";
import { useStore } from "@ui/state/store";
import type { Exchange } from "@ui/state/reducer";
import { matchesFilter } from "@ui/lib/utils";
import { ExchangeListItem } from "./ExchangeListItem";

export function ExchangeList() {
  const exchanges = useStore((s) => s.exchanges);
  const ids = useStore((s) => s.ids);
  const selectedId = useStore((s) => s.selectedId);
  const setSelectedId = useStore((s) => s.setSelectedId);
  const filter = useStore((s) => s.filter);
  const order = useStore((s) => s.order);
  const setOrder = useStore((s) => s.setOrder);
  const density = useStore((s) => s.density);
  const listMode = useStore((s) => s.listMode);
  const setListMode = useStore((s) => s.setListMode);
  const cmdKOpen = useStore((s) => s.cmdKOpen);
  const setCmdKOpen = useStore((s) => s.setCmdKOpen);

  // Derive filtered + ordered list
  const filtered = ids
    .map((id) => exchanges.get(id))
    .filter((ex): ex is Exchange => ex != null)
    .filter((ex) => matchesFilter(ex, filter));

  const ordered = order === "newest" ? [...filtered].reverse() : filtered;

  // Virtualizer setup
  const scrollRef = useRef<HTMLDivElement>(null);
  const rowHeight = density === "compact" ? 58 : 74;

  const virtualizer = useVirtualizer({
    count: ordered.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
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
        {/* Left: label */}
        <span className="font-family-ui text-xs font-semibold text-mid uppercase tracking-widest">
          Exchanges
        </span>

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
        <div className="flex-1 flex items-center justify-center bg-bg-pane">
          <span className="font-family-ui text-xs text-dim uppercase tracking-widest">
            Table view coming soon
          </span>
        </div>
      ) : ordered.length === 0 ? (
        <div className="flex-1 flex items-center justify-center bg-bg-pane">
          <span className="font-family-ui text-xs text-dim uppercase tracking-widest">
            {filter ? "No exchanges match" : "No exchanges"}
          </span>
        </div>
      ) : (
        /* Virtualized scrollable list */
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto overflow-x-hidden bg-bg-pane"
        >
          <div
            style={{ height: virtualizer.getTotalSize(), position: "relative" }}
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
      )}
    </div>
  );
}
