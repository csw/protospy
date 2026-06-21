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
import { ChevronDown } from "lucide-react";
import { classifyEvent } from "@ui/body/sse";
import type { SSEEvent } from "@ui/body/sse";
import { cn } from "@ui/lib/utils";
import { observeElementRectWithFallback } from "@ui/lib/virtual";
import { Button } from "@ui/components/ui/button";

const EVENT_ROW_HEIGHT = 28;

/**
 * Plain-text label color per SSE event type — semantic tokens only (no raw
 * palette colors). This is the scaffold's `EVENT_TYPE_CLASS`, replacing the
 * legacy filled-pill `eventTypeBadgeClass`.
 *
 * Color logic:
 *   text-sse-lifecycle — lifecycle / boundary events (start, stop, block edges)
 *   text-ok            — data-carrying events (deltas with actual content)
 *   text-muted-foreground      — terminal or low-signal events (message_stop)
 *   text-muted-foreground/70   — keepalive noise (ping)
 *   text-secondary-foreground  — everything else (metadata, unknown)
 */
export function eventTypeClass(type: string): string {
  switch (type) {
    case "message_start":
    case "content_block_start":
    case "content_block_stop":
      return "text-sse-lifecycle";
    case "content_block_delta":
      return "text-ok";
    case "message_delta":
      return "text-secondary-foreground";
    case "message_stop":
      return "text-muted-foreground";
    case "ping":
      return "text-muted-foreground/70";
    default:
      return "text-secondary-foreground";
  }
}

function EventDataSummary({ data }: { data: string }) {
  const [expanded, setExpanded] = useState(false);
  const isTruncated = data.length > 80;

  if (!isTruncated) {
    return <span className="truncate text-secondary-foreground">{data}</span>;
  }

  return (
    <div className="flex min-w-0 items-start gap-1">
      <span
        className={cn(
          "text-secondary-foreground",
          expanded ? "break-all" : "truncate",
        )}
      >
        {expanded ? data : data.slice(0, 80) + "…"}
      </span>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={expanded ? "Collapse event data" : "Expand event data"}
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
        className="-my-1 shrink-0 text-muted-foreground"
      >
        <ChevronDown
          className={cn("transition-transform", expanded && "rotate-180")}
        />
      </Button>
    </div>
  );
}

interface EventLogProps {
  events: SSEEvent[];
  /** Scroll container ref from the parent stream view — drives the virtualizer. */
  scrollRef: RefObject<HTMLDivElement | null>;
}

export function EventLog({ events, scrollRef }: EventLogProps) {
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
            {/* The row is a non-interactive container: its only control is the
                expand toggle inside EventDataSummary. Keeping the row a plain
                <div> (not a <button>) is what avoids nesting that toggle's
                <button> inside another <button> — invalid DOM that triggered a
                React validation error in the Anthropic stream scenes (PRO-440). */}
            <div
              data-kind={kind}
              className="grid w-full grid-cols-[150px_1fr] items-baseline gap-2.5 border-b px-3 py-1 text-left"
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
            </div>
          </div>
        );
      })}
    </div>
  );
}
