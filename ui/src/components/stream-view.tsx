// src/components/stream-view.tsx
// Generic SSE stream pane (v2.3). Renders live SSE events through the scaffold
// presentation: a four-state live indicator, plain semantic-token event-row
// text labels (EventLog), play/pause, and scroll-follow with a jump-to-latest
// pill. Replaces the legacy StreamView + EventsView for non-Anthropic SSE.
//
// Consumes the live `SSEEvent` shape directly (no StreamEvent rename map) and
// carries the legacy engine's capabilities onto the new presentation:
//   - virtualization (EventLog) so the list stays responsive under high rates
//   - scroll-follow + jump-to-latest (useStreamFollow)
//   - the four-state indicator (deriveStreamState: live/paused/disconnected/complete)
//   - play/pause: freezes the displayed events at a stable snapshot so paused
//     frames neither accumulate nor leak across pause/resume. BodySplit keys
//     this view on `exchange.id`, so the snapshot resets per exchange and a
//     paused stream never bleeds onto a different one.

import { useState } from "react";
import { Pause, Play } from "lucide-react";
import type { Exchange } from "@ui/state/types";
import type { SSEEvent } from "@ui/body/sse";
import { Button } from "@ui/components/ui/button";
import {
  LiveIndicator,
  deriveStreamState,
} from "@ui/components/live-indicator";
import { StreamErrorBanner } from "@ui/components/stream-error-banner";
import { useStreamFollow } from "@ui/hooks/useStreamFollow";
import { EventLog } from "./event-log";

type LiveState = "live" | "paused" | "disconnected" | "complete";

interface Props {
  exchange: Exchange;
}

export function StreamView({ exchange }: Props) {
  const body = exchange.responseBody;
  const atEnd = body?.atEnd ?? true;
  const events = body?.sseState?.events ?? [];
  const errorMessage = exchange.error?.message;

  // Play/pause snapshot. While `frozen` is set the view renders that captured
  // list and ignores newly-arrived events; resuming drops it. This state is per
  // exchange because BodySplit keys the component on `exchange.id`.
  const [frozen, setFrozen] = useState<SSEEvent[] | null>(null);

  // Follow length uses the *displayed* list so auto-scroll stays put while
  // paused (a frozen snapshot has a constant length). Kept off `terminal` to
  // avoid a derive cycle with deriveStreamState below.
  const followLen = (frozen ?? events).length;
  const { isFollowing, scrollRef, handleScroll, jumpToLatest } =
    useStreamFollow([followLen]);

  const derived = deriveStreamState(atEnd, isFollowing, exchange.error);
  const terminal = derived === "complete" || derived === "disconnected";
  // A finished stream can't be paused: ignore any lingering snapshot so the
  // final events show and the transport control disappears.
  const paused = frozen != null && !terminal;
  const shownEvents = paused && frozen != null ? frozen : events;
  const liveState: LiveState = paused ? "paused" : derived;
  // The transport control reflects the play/pause (freeze) state only, never
  // the scroll-derived "paused" indicator — scrolling away must not flip the
  // button to "Resume" while the stream is still playing.
  const playing = frozen == null;

  // Jump-to-latest applies only when scrolled away from a still-live stream —
  // not when play-paused (the list is frozen) or terminal.
  const showJump = frozen == null && derived === "paused";

  const togglePlay = () => setFrozen((f) => (f != null ? null : events));

  return (
    <div className="flex h-full flex-col overflow-hidden bg-card">
      <div className="flex items-center gap-2.5 border-b px-gutter-x py-2">
        <LiveIndicator state={liveState} />
        {!terminal && (
          <Button
            variant="ghost"
            size="icon-chrome"
            onClick={togglePlay}
            className="ml-auto text-muted-foreground"
            aria-label={playing ? "Pause stream" : "Resume stream"}
          >
            {playing ? <Pause /> : <Play />}
          </Button>
        )}
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        <div
          ref={scrollRef}
          data-testid="stream-scroll"
          className="flex flex-1 flex-col overflow-auto"
          onScroll={handleScroll}
        >
          <EventLog events={shownEvents} scrollRef={scrollRef} />
        </div>

        {errorMessage != null && <StreamErrorBanner message={errorMessage} />}

        {showJump && (
          <Button
            size="sm"
            onClick={jumpToLatest}
            className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full shadow-lg"
          >
            Jump to latest
          </Button>
        )}

        {/* a11y: announce stream state + event-count changes to assistive tech */}
        <div className="sr-only" role="status" aria-live="polite">
          {liveState}, {shownEvents.length} events
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Compatibility exports consumed by `chat-stream-view`. The wired stream
// surfaces use the shared `@ui/components/LiveIndicator` above.
// ─────────────────────────────────────────────────────────────────────────────

export type StreamLiveState = "live" | "paused" | "disconnected" | "complete";
export type StreamMode = "transcript" | "events";
export { LiveIndicator };
