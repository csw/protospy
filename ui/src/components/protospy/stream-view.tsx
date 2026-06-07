// src/components/protospy/stream-view.tsx
// SSE stream view. Replaces the response pane for protocol === "sse".
// Handoff deltas baked in:
//   - play/pause control (no replay button, no N/Total counter)
//   - live indicator has FOUR states: live · paused · disconnected · complete
//   - events ↔ transcript modes; implicit live-follow with a "jump to latest" pill
// Transcript aggregation is provider-aware via your parser registry; this view is
// given already-parsed events + an optional transcript string.

"use client";

import { Pause, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { StreamEvent } from "@/lib/types";

export type StreamLiveState = "live" | "paused" | "disconnected" | "complete";
export type StreamMode = "transcript" | "events";

const LIVE: Record<
  StreamLiveState,
  { text: string; dot: string; label: string }
> = {
  live: {
    text: "text-ok",
    dot: "bg-ok motion-safe:animate-pulse",
    label: "live",
  },
  paused: { text: "text-redirect", dot: "bg-redirect", label: "paused" },
  disconnected: { text: "text-error", dot: "bg-error", label: "disconnected" },
  complete: {
    text: "text-muted-foreground",
    dot: "bg-muted-foreground",
    label: "complete",
  },
};

const EVENT_TYPE_CLASS = (type: string): string => {
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
};

export interface StreamViewProps {
  events: StreamEvent[];
  transcript?: string | null; // null ⇒ no parser matched; force events mode
  liveState: StreamLiveState;
  mode: StreamMode;
  following: boolean;
  selectedSeq?: number | null;
  onModeChange: (m: StreamMode) => void;
  onTogglePlay: () => void;
  onSelectEvent?: (seq: number) => void;
  onJumpToLatest?: () => void;
  /** render a parsed event's `data` for the events log */
  renderEventBody: (e: StreamEvent) => React.ReactNode;
}

export function StreamView({
  events,
  transcript,
  liveState,
  mode,
  following,
  selectedSeq,
  onModeChange,
  onTogglePlay,
  onSelectEvent,
  onJumpToLatest,
  renderEventBody,
}: StreamViewProps) {
  const live = LIVE[liveState];
  const playing = liveState === "live";
  const canTranscript = transcript != null;

  return (
    <div className="flex h-full flex-col bg-card">
      <div className="flex items-center gap-2.5 border-b px-gutter-x py-2">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 text-xs font-medium",
            live.text,
          )}
        >
          <span className={cn("size-1.5 rounded-full", live.dot)} aria-hidden />
          {live.label}
        </span>
        <ToggleGroup
          type="single"
          value={mode}
          onValueChange={(v) => v && onModeChange(v as StreamMode)}
          size="sm"
        >
          {canTranscript && (
            <ToggleGroupItem value="transcript">transcript</ToggleGroupItem>
          )}
          <ToggleGroupItem value="events">events</ToggleGroupItem>
        </ToggleGroup>
        <button
          type="button"
          onClick={onTogglePlay}
          className="ml-auto inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-hover hover:text-foreground"
          aria-label={playing ? "Pause stream" : "Resume stream"}
        >
          {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
        </button>
      </div>

      <div className="relative min-h-0 flex-1 overflow-auto">
        {mode === "events" || !canTranscript ? (
          <div className="py-1 font-mono text-sm">
            {events.map((e) => (
              <button
                key={e.seq}
                type="button"
                onClick={() => onSelectEvent?.(e.seq)}
                data-selected={selectedSeq === e.seq || undefined}
                className="grid w-full grid-cols-[52px_150px_1fr] items-baseline gap-2.5 border-b px-3 py-1 text-left hover:bg-hover data-[selected]:bg-accent"
              >
                <span className="whitespace-nowrap text-xs text-muted-foreground">
                  +{e.offsetMs}ms
                </span>
                <span
                  className={cn(
                    "truncate text-xs font-medium uppercase tracking-wide",
                    EVENT_TYPE_CLASS(e.type),
                  )}
                >
                  {e.type}
                </span>
                <span className="truncate text-secondary-foreground">
                  {renderEventBody(e)}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className="whitespace-pre-wrap px-4 py-3 font-mono text-mono leading-relaxed text-foreground">
            {transcript}
            {liveState === "live" && (
              <span className="ml-px inline-block h-[1.05em] w-2 translate-y-0.5 bg-primary motion-safe:animate-[caret_0.9s_steps(1)_infinite]" />
            )}
          </div>
        )}

        {!following && (
          <button
            type="button"
            onClick={onJumpToLatest}
            className="absolute bottom-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground shadow-lg"
          >
            Jump to latest
          </button>
        )}
      </div>
    </div>
  );
}
