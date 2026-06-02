import type { Exchange } from "@ui/state/reducer";
import { LiveIndicator } from "@ui/components/LiveIndicator";
import { EventsView } from "@ui/components/EventsView";
import { useStreamFollow } from "@ui/hooks/useStreamFollow";

interface Props {
  exchange: Exchange;
}

export function StreamView({ exchange }: Props) {
  const body = exchange.responseBody;
  const atEnd = body?.atEnd ?? true;
  const events = body?.sseState?.events ?? [];
  const totalEventCount = body?.sseState?.totalEventCount ?? events.length;

  const { isFollowing, scrollRef, handleScroll, jumpToLatest } =
    useStreamFollow([events.length]);

  return (
    <div className="flex flex-col border border-border h-full overflow-hidden">
      <div className="flex items-center gap-3 px-3 h-[30px] shrink-0 bg-bg-sub border-b border-border">
        <LiveIndicator atEnd={atEnd} isFollowing={isFollowing} />
        <span className="ml-auto text-xs text-dim font-family-mono">
          {totalEventCount} events
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
            className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-accent text-primary-foreground text-xs rounded-full px-3 py-1 cursor-pointer shadow-md"
          >
            Jump to latest
          </button>
        )}
      </div>
    </div>
  );
}
