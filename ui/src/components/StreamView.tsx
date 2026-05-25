import { useMemo, useRef, useEffect, useCallback, useState } from "react";
import type { Exchange } from "@ui/state/reducer";
import { parseSSEBody, chunksToText } from "@ui/body/sse";
import type { SSEEvent } from "@ui/body/sse";
import { eventTypeBadgeClass } from "@ui/lib/utils";
import { LiveIndicator } from "@ui/components/LiveIndicator";

interface Props {
  exchange: Exchange;
}

function EventsView({ events }: { events: SSEEvent[] }) {
  if (events.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-dim text-xs">
        No events yet
      </div>
    );
  }
  return (
    <div className="flex-1 overflow-auto">
      {events.map((event) => (
        <div
          key={event.index}
          className="flex items-center gap-3 px-3 min-h-[28px] py-1 border-b border-border hover:bg-bg-hl"
        >
          <span className="font-family-mono text-xs text-dim shrink-0 w-6 text-right">
            {event.index}
          </span>
          <span
            className={`font-family-mono text-xs px-1.5 py-0.5 rounded shrink-0 ${eventTypeBadgeClass(event.type)}`}
          >
            {event.type}
          </span>
          <span className="font-family-mono text-xs text-dim truncate">
            {event.data.length > 80
              ? event.data.slice(0, 80) + "…"
              : event.data}
          </span>
        </div>
      ))}
    </div>
  );
}

export function StreamView({ exchange }: Props) {
  const [isFollowing, setIsFollowing] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  const body = exchange.responseBody;
  const atEnd = body?.atEnd ?? true;

  const events = useMemo(() => {
    if (!body) return [];
    const text = chunksToText(body);
    return parseSSEBody(text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [body?.chunks.length, body?.atEnd]);

  useEffect(() => {
    if (!isFollowing) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [events, isFollowing]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setIsFollowing(distFromBottom < 40);
  }, []);

  const jumpToLatest = useCallback(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    setIsFollowing(true);
  }, []);

  return (
    <div className="flex flex-col border border-border h-full overflow-hidden">
      <div className="flex items-center gap-3 px-3 h-[30px] shrink-0 bg-bg-sub border-b border-border">
        <LiveIndicator atEnd={atEnd} isFollowing={isFollowing} />
        <span className="ml-auto text-xs text-dim font-family-mono">
          {events.length} events
        </span>
      </div>

      <div className="relative flex flex-col flex-1 overflow-hidden">
        <div
          ref={scrollRef}
          data-testid="stream-scroll"
          className="flex flex-col flex-1 overflow-auto"
          onScroll={handleScroll}
        >
          <EventsView events={events} />
        </div>
        {!isFollowing && !atEnd && (
          <button
            onClick={jumpToLatest}
            className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-accent text-white text-xs rounded-full px-3 py-1 cursor-pointer shadow-md"
          >
            Jump to latest
          </button>
        )}
      </div>
    </div>
  );
}
