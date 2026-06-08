import { useState } from "react";
import { Pause, Play } from "lucide-react";
import type { Exchange } from "@ui/state/reducer";
import type { SSEEvent } from "@ui/body/sse";
import { readEventStream } from "@ui/body/event-stream";
import { LiveIndicator, deriveStreamState } from "@ui/components/LiveIndicator";
import { EventsView } from "@ui/components/EventsView";
import { StreamErrorBanner } from "@ui/components/StreamErrorBanner";
import { Button } from "@ui/components/ui/button";
import { useStreamFollow } from "@ui/hooks/useStreamFollow";

interface Props {
  exchange: Exchange;
}

export function StreamView({ exchange }: Props) {
  const {
    events: liveEvents,
    totalEventCount,
    atEnd,
  } = readEventStream(exchange.responseBody);
  const errorMessage = exchange.error?.message;

  // Play/pause freezes the live event tail. Pausing snapshots the events as of the
  // moment the user paused (captured in the click handler, not during render); new
  // events keep accumulating in the store but are held back from the view until the
  // user resumes. `frozenEvents === null` means playing.
  const [frozenEvents, setFrozenEvents] = useState<SSEEvent[] | null>(null);
  const paused = frozenEvents !== null;
  const events = frozenEvents ?? liveEvents;

  const { isFollowing, scrollRef, handleScroll, jumpToLatest } =
    useStreamFollow([events.length]);

  // A user-initiated pause stops the live tail; treat it as not-following so the
  // indicator reads "paused" (a stream that has ended / disconnected wins).
  const state = deriveStreamState(
    atEnd,
    isFollowing && !paused,
    exchange.error,
  );
  // Pausing only has meaning while events can still arrive.
  const canPause = !atEnd;

  function togglePlay() {
    if (paused) {
      setFrozenEvents(null);
      jumpToLatest(); // resuming → catch up to the live tip
    } else {
      setFrozenEvents(liveEvents); // snapshot the tail at pause time
    }
  }

  function resumeLatest() {
    setFrozenEvents(null);
    jumpToLatest();
  }

  return (
    <div className="flex flex-col border border-border h-full overflow-hidden">
      <div className="flex items-center gap-3 px-3 h-[30px] shrink-0 bg-muted border-b border-border">
        <LiveIndicator state={state} />
        {/* Politely announce stream state + arrivals for non-visual users (a11y).
            Phrased to avoid the literal "N events" so it doesn't collide with the
            visible count span under substring text queries. */}
        <span className="sr-only" aria-live="polite">
          Stream {state}, {totalEventCount} received
        </span>
        {canPause && (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={togglePlay}
            aria-pressed={paused}
            aria-label={paused ? "Resume stream" : "Pause stream"}
          >
            {paused ? <Play /> : <Pause />}
          </Button>
        )}
        <span className="ml-auto text-xs text-muted-foreground font-mono">
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
          <EventsView events={events} scrollRef={scrollRef} />
        </div>
        {errorMessage != null && <StreamErrorBanner message={errorMessage} />}
        {state === "paused" && (
          <button
            type="button"
            onClick={resumeLatest}
            className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-xs rounded-full px-3 py-1 cursor-pointer shadow-md"
          >
            Jump to latest
          </button>
        )}
      </div>
    </div>
  );
}
