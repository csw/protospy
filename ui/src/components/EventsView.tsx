import { useEffect, useState } from "react";
import type { RefObject } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { SSEEvent } from "@ui/body/sse";
import { cn, eventTypeBadgeClass } from "@ui/lib/utils";
import { observeElementRectWithFallback } from "@ui/lib/virtual";
import { SimpleTooltip } from "./ui/SimpleTooltip";

function EventDataSummary({ event }: { event: SSEEvent }) {
  const summary =
    event.data.length > 80 ? event.data.slice(0, 80) + "…" : event.data;
  return (
    <SimpleTooltip content={event.data}>
      <span className="font-mono text-xs text-dim truncate">{summary}</span>
    </SimpleTooltip>
  );
}

const EVENT_ROW_HEIGHT = 28;

interface EventsViewProps {
  events: SSEEvent[];
  /** Scroll container ref from the parent — used by the virtualizer. */
  scrollRef: RefObject<HTMLDivElement | null>;
}

export function EventsView({ events, scrollRef }: EventsViewProps) {
  // The scroll container ref lives in the parent component (StreamView /
  // ChatStreamView). React attaches refs and runs layout effects child-
  // first, so on the initial commit the parent's ref is still null when
  // our virtualizer's _willUpdate runs. We force one additional render
  // after mount so the virtualizer can pick up the now-attached ref.
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
      <div className="flex-1 flex items-center justify-center text-dim text-xs">
        No events yet
      </div>
    );
  }

  return (
    <div
      style={{
        height: virtualizer.getTotalSize(),
        position: "relative",
      }}
    >
      {virtualizer.getVirtualItems().map((virtualItem) => {
        const event = events[virtualItem.index];
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
            <div className="flex items-center gap-3 px-3 min-h-[28px] py-1 border-b border-border hover:bg-bg-hl">
              <span className="font-mono text-xs text-dim shrink-0 w-6 text-right">
                {event.index}
              </span>
              <span
                className={cn(
                  "font-mono text-xs px-1.5 py-0.5 rounded shrink-0",
                  eventTypeBadgeClass(event.type),
                )}
              >
                {event.type}
              </span>
              <div className="flex-1 min-w-0 overflow-hidden">
                <EventDataSummary event={event} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
