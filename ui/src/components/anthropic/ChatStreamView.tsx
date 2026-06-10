import { useMemo, useState } from "react";
import type { Exchange } from "@ui/state/reducer";
import { extractAnthropicTranscript } from "@ui/anthropic/transcript";
import type { SSEEvent } from "@ui/body/sse";
import { LiveIndicator, deriveStreamState } from "@ui/components/LiveIndicator";
import { EventLog } from "@ui/components/protospy/event-log";
import { StreamErrorBanner } from "@ui/components/StreamErrorBanner";
import { Button } from "@ui/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@ui/components/ui/toggle-group";
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
        <div className="flex shrink-0 gap-1.5 border-b px-3 py-1.5 font-mono text-xs text-muted-foreground">
          {transcript.model != null && <span>{transcript.model}</span>}
          {transcript.model != null && transcript.messageId != null && (
            <span>·</span>
          )}
          {transcript.messageId != null && (
            <span>msg {transcript.messageId.slice(0, 14)}…</span>
          )}
        </div>
      )}
      <pre className="flex-1 whitespace-pre-wrap p-3 font-mono text-mono text-foreground">
        {transcript.text}
        {!isTerminal && !transcript.isComplete && (
          <span className="inline-block w-[2px] h-[14px] bg-primary motion-safe:animate-pulse align-middle ml-px" />
        )}
      </pre>
      {transcript.isComplete && (
        <div className="flex shrink-0 gap-4 border-t px-3 py-2 text-xs text-muted-foreground">
          <span>stop_reason: {transcript.stopReason ?? "—"}</span>
          {transcript.usage != null && (
            <span>
              {[
                transcript.usage.input_tokens != null
                  ? `usage: ${transcript.usage.input_tokens} in`
                  : null,
                transcript.usage.output_tokens != null
                  ? `${transcript.usage.output_tokens} out`
                  : null,
              ]
                .filter(Boolean)
                .join(" / ")}
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

  const { isFollowing, scrollRef, handleScroll, jumpToLatest } =
    useStreamFollow([events.length]);

  const errorMessage = exchange.error?.message;

  const state = deriveStreamState(atEnd, isFollowing, exchange.error);
  const isTerminal = state === "complete" || state === "disconnected";

  return (
    <div className="flex h-full flex-col overflow-hidden bg-card">
      <div className="flex shrink-0 items-center gap-2.5 border-b px-gutter-x py-2">
        <LiveIndicator state={state} />
        <ToggleGroup
          type="single"
          value={mode}
          onValueChange={(v) => v && setMode(v as Mode)}
          size="sm"
        >
          <ToggleGroupItem value="transcript">transcript</ToggleGroupItem>
          <ToggleGroupItem value="events">events</ToggleGroupItem>
        </ToggleGroup>
      </div>

      <div className="relative flex flex-col flex-1 overflow-hidden">
        <div
          ref={scrollRef}
          data-testid="stream-scroll"
          className="flex flex-col flex-1 overflow-auto"
          onScroll={handleScroll}
        >
          {mode === "events" ? (
            <EventLog events={events} scrollRef={scrollRef} />
          ) : (
            <TranscriptView events={events} isTerminal={isTerminal} />
          )}
        </div>
        {errorMessage != null && <StreamErrorBanner message={errorMessage} />}
        {state === "paused" && (
          <Button
            size="sm"
            onClick={jumpToLatest}
            className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full shadow-md"
          >
            Jump to latest
          </Button>
        )}
      </div>
    </div>
  );
}
