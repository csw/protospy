// src/components/protospy/chat-stream-view.tsx
// The Anthropic chat transcript/events view — the surface that predated the
// mockup, brought into v2.3. This is a CONFORMANCE pass, not a redesign of
// LLM-exchange rendering:
//   • token-migrated — the legacy amber paused/connecting state now points at the
//     shared LiveIndicator (--conn-* tokens); no raw colors remain.
//   • DS styling — card/border/mono tokens, underline-free segmented control.
//   • control reconciled — the bespoke transcript/events buttons become a
//     shadcn ToggleGroup (the system's segmented pattern), matching StreamView.
//   • v2.3 stream rules applied — play/pause only; the legacy replay button and
//     the N/Total counter are dropped (design-system §4.11).
//
// Chat-specific extras kept from the original: a model · msg-id header, and a
// completion footer (stop_reason + token usage). Transcript aggregation stays
// parser-owned (Anthropic content_block_delta.text_delta) — passed in, not done
// here — so the view is prop-driven like the other content components.

import { Pause, Play, CornerDownRight, CircleCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { StreamEvent } from "@/lib/types";
import {
  LiveIndicator,
  type StreamLiveState,
  type StreamMode,
} from "./stream-view";

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

/** Parser-derived chat metadata (Anthropic message_start / message_delta). */
export interface ChatStreamMeta {
  model?: string;
  messageId?: string;
  stopReason?: string | null;
  usage?: { inputTokens?: number; outputTokens?: number } | null;
}

export interface ChatStreamViewProps {
  events: StreamEvent[];
  /** aggregated assistant text (parser-owned: content_block_delta.text_delta) */
  transcript: string;
  meta?: ChatStreamMeta;
  liveState: StreamLiveState;
  mode: StreamMode;
  following: boolean;
  selectedSeq?: number | null;
  onModeChange: (m: StreamMode) => void;
  onTogglePlay: () => void;
  onSelectEvent?: (seq: number) => void;
  onJumpToLatest?: () => void;
  renderEventBody: (e: StreamEvent) => React.ReactNode;
}

export function ChatStreamView({
  events,
  transcript,
  meta,
  liveState,
  mode,
  following,
  selectedSeq,
  onModeChange,
  onTogglePlay,
  onSelectEvent,
  onJumpToLatest,
  renderEventBody,
}: ChatStreamViewProps) {
  const playing = liveState === "live";
  const complete = liveState === "complete";

  return (
    <div className="flex h-full flex-col bg-card">
      <div className="flex items-center gap-2.5 border-b px-gutter-x py-2">
        <LiveIndicator state={liveState} />
        <ToggleGroup
          type="single"
          value={mode}
          onValueChange={(v) => v && onModeChange(v as StreamMode)}
          size="sm"
        >
          <ToggleGroupItem value="transcript">transcript</ToggleGroupItem>
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
        {mode === "transcript" ? (
          <div className="px-4 py-3 font-mono text-mono leading-relaxed text-foreground">
            {meta?.model && (
              <div className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                <CornerDownRight className="size-3" />
                {meta.model}
                {meta.messageId && (
                  <span>· msg {meta.messageId.slice(0, 14)}…</span>
                )}
              </div>
            )}
            <span className="whitespace-pre-wrap">{transcript}</span>
            {playing && (
              <span className="ml-px inline-block h-[1.05em] w-2 translate-y-0.5 bg-primary motion-safe:animate-[caret_0.9s_steps(1)_infinite]" />
            )}
            {complete && (
              <div className="mt-3 flex items-center gap-2 border-t pt-2 text-xs text-muted-foreground">
                <CircleCheck className="size-3.5 text-ok" />
                <span>stop_reason: {meta?.stopReason ?? "—"}</span>
                {meta?.usage && (
                  <span>
                    · usage: {meta.usage.inputTokens ?? "?"} in /{" "}
                    {meta.usage.outputTokens ?? "?"} out
                  </span>
                )}
              </div>
            )}
          </div>
        ) : (
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
