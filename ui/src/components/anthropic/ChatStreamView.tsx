import { useMemo, useState } from "react";
import type { Exchange } from "@ui/state/reducer";
import { extractAnthropicTranscript } from "@ui/anthropic/transcript";
import type { SSEEvent } from "@ui/body/sse";
import { cn } from "@ui/lib/utils";
import { LiveIndicator, deriveStreamState } from "@ui/components/LiveIndicator";
import { EventsView } from "@ui/components/EventsView";
import { StreamErrorBanner } from "@ui/components/StreamErrorBanner";
import { useStreamFollow } from "@ui/hooks/useStreamFollow";

interface Props {
  exchange: Exchange;
}

function TranscriptView({
  events,
  isTerminal,
}: {
  events: SSEEvent[];
  isTerminal: boolean;
}) {
  const transcript = useMemo(
    () => extractAnthropicTranscript(events),
    [events],
  );

  return (
    <div className="flex-1 overflow-auto flex flex-col">
      {(transcript.model != null || transcript.messageId != null) && (
        <div className="flex gap-3 px-3 py-1.5 border-b border-border shrink-0">
          {transcript.messageId != null && (
            <span className="font-mono text-xs text-dim">
              {transcript.messageId}
            </span>
          )}
          {transcript.model != null && (
            <span className="font-mono text-xs text-dim">
              {transcript.model}
            </span>
          )}
        </div>
      )}
      <pre className="font-mono text-sm text-ink whitespace-pre-wrap p-3 flex-1">
        {transcript.text}
        {!isTerminal && !transcript.isComplete && (
          <span className="inline-block w-[2px] h-[14px] bg-primary animate-pulse align-middle ml-px" />
        )}
      </pre>
      {transcript.isComplete && (
        <div className="flex gap-4 px-3 py-2 border-t border-border shrink-0">
          <span className="text-dim text-xs">
            Completed
            {transcript.stopReason != null ? ` · ${transcript.stopReason}` : ""}
          </span>
          {transcript.usage != null && (
            <span className="text-dim text-xs">
              {[
                transcript.usage.input_tokens != null
                  ? `Input: ${transcript.usage.input_tokens}`
                  : null,
                transcript.usage.output_tokens != null
                  ? `Output: ${transcript.usage.output_tokens}`
                  : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

type Mode = "events" | "transcript";

export function ChatStreamView({ exchange }: Props) {
  const [mode, setMode] = useState<Mode>("events");

  const body = exchange.responseBody;
  const atEnd = body?.atEnd ?? true;
  const events = body?.sseState?.events ?? [];
  const totalEventCount = body?.sseState?.totalEventCount ?? events.length;

  const { isFollowing, scrollRef, handleScroll, jumpToLatest } =
    useStreamFollow([events.length]);

  const errorMessage = exchange.error?.message;

  const state = deriveStreamState(atEnd, isFollowing, exchange.error);
  const isTerminal = state === "complete" || state === "disconnected";

  const segmentBase =
    "text-xs px-2 py-0.5 rounded cursor-pointer transition-colors";
  const segmentActive = "bg-bg-hl text-ink font-medium";
  const segmentInactive = "text-dim hover:text-ink";

  return (
    <div className="flex flex-col border border-border h-full overflow-hidden">
      <div className="flex items-center gap-3 px-3 h-[30px] shrink-0 bg-bg-sub border-b border-border">
        <LiveIndicator state={state} />
        <div className="flex items-center gap-0.5 bg-bg-pane rounded px-0.5 py-0.5">
          <button
            className={cn(
              segmentBase,
              mode === "transcript" ? segmentActive : segmentInactive,
            )}
            onClick={() => setMode("transcript")}
          >
            transcript
          </button>
          <button
            className={cn(
              segmentBase,
              mode === "events" ? segmentActive : segmentInactive,
            )}
            onClick={() => setMode("events")}
          >
            events
          </button>
        </div>
        <span className="ml-auto text-xs text-dim font-mono">
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
          {mode === "events" ? (
            <EventsView events={events} scrollRef={scrollRef} />
          ) : (
            <TranscriptView events={events} isTerminal={isTerminal} />
          )}
        </div>
        {errorMessage != null && <StreamErrorBanner message={errorMessage} />}
        {state === "paused" && (
          <button
            onClick={jumpToLatest}
            className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-xs rounded-full px-3 py-1 cursor-pointer shadow-md"
          >
            Jump to latest
          </button>
        )}
      </div>
    </div>
  );
}
