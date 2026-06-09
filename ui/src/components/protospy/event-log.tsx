// src/components/protospy/event-log.tsx
// Virtualized SSE event list — the v2.3 scaffold's event-row presentation.
// Replaces the legacy EventsView: rows are plain semantic-token text labels
// (no filled pills), with `data-selected` row state, keyed and selected off the
// live `SSEEvent.index`. Shared by the generic stream view and the Anthropic
// ChatStreamView. The scroll container lives in the parent stream view; this
// component renders the sized, absolutely-positioned virtual rows inside it.

import { useEffect, useState } from "react";
import type { RefObject } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { classifyEvent } from "@ui/body/sse";
import type { SSEEvent } from "@ui/body/sse";
import { cn } from "@ui/lib/utils";
import { observeElementRectWithFallback } from "@ui/lib/virtual";
import { SimpleTooltip } from "@ui/components/ui/SimpleTooltip";

const EVENT_ROW_HEIGHT = 28;

/**
 * Plain-text label color per SSE event type — semantic tokens only (no raw
 * palette colors). This is the scaffold's `EVENT_TYPE_CLASS`, replacing the
 * legacy filled-pill `eventTypeBadgeClass`.
 */
export function eventTypeClass(type: string): string {
  switch (type) {
    case "message_start":
      return "text-method-patch";
    case "content_block_delta":
      return "text-ok";
    case "message_delta":
      return "text-accent-foreground";
    case "message_stop":
      return "text-muted-foreground";
    case "ping":
      return "text-muted-foreground/70";
    default:
      return "text-secondary-foreground";
  }
}

function EventDataSummary({ data }: { data: string }) {
  const summary = data.length > 80 ? data.slice(0, 80) + "…" : data;
  return (
    <SimpleTooltip content={data}>
      <span className="truncate text-secondary-foreground">{summary}</span>
    </SimpleTooltip>
  );
}

interface EventLogProps {
  events: SSEEvent[];
  /** Scroll container ref from the parent stream view — drives the virtualizer. */
  scrollRef: RefObject<HTMLDivElement | null>;
  /** `index` of the selected row, if any. */
  selectedIndex?: number | null;
  onSelect?: (index: number) => void;
}

export function EventLog({
  events,
  scrollRef,
  selectedIndex,
  onSelect,
}: EventLogProps) {
  // The scroll container ref lives in the parent. React attaches refs and runs
  // layout effects child-first, so on the initial commit the parent's ref is
  // still null when the virtualizer's _willUpdate runs. Force one render after
  // mount so the virtualizer can pick up the now-attached ref.
  const [, remount] = useState(false);
  useEffect(() => {
    remount(true);
  }, []);

  // React Compiler bails out on useVirtualizer (`react-hooks/incompatible-library`)
  // because its methods close over mutable instance state. Safe to ignore here:
  // we don't enable the compiler in this build, and the returned methods are
  // only invoked inline — they're never handed to a memoized child.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: events.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => EVENT_ROW_HEIGHT,
    getItemKey: (index) => events[index]?.index ?? index,
    overscan: 10,
    observeElementRect: observeElementRectWithFallback,
  });

  if (events.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
        No events yet
      </div>
    );
  }

  return (
    <div
      className="font-mono text-mono"
      style={{ height: virtualizer.getTotalSize(), position: "relative" }}
    >
      {virtualizer.getVirtualItems().map((virtualItem) => {
        const event = events[virtualItem.index];
        // O2 classification seam — one variant ("generic") today; additively
        // extensible without touching the live SSEEvent shape. Surfaced as
        // `data-kind` so future per-kind row rendering has a live hook.
        const { kind } = classifyEvent(event);
        const selected = selectedIndex === event.index;
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
            <button
              type="button"
              onClick={() => onSelect?.(event.index)}
              data-selected={selected || undefined}
              data-kind={kind}
              className="grid w-full grid-cols-[150px_1fr] items-baseline gap-2.5 border-b px-3 py-1 text-left hover:bg-hover data-[selected]:bg-accent"
            >
              <span
                className={cn(
                  "truncate text-xs font-medium uppercase tracking-wide",
                  eventTypeClass(event.type),
                )}
              >
                {event.type}
              </span>
              <EventDataSummary data={event.data} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
