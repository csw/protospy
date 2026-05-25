import { useMemo, useRef, useEffect, useState, useCallback } from "react";
import type { Exchange } from "@ui/state/reducer";
import { parseSSEBody, chunksToText } from "@ui/body/sse";
import { extractAnthropicTranscript } from "@ui/anthropic/transcript";
import type { SSEEvent } from "@ui/body/sse";
import { eventTypeBadgeClass } from "@ui/lib/utils";

interface Props {
  exchange: Exchange;
}

function EventDataSummary({ event }: { event: SSEEvent }) {
  const summary =
    event.data.length > 80 ? event.data.slice(0, 80) + "…" : event.data;
  return (
    <span className="font-family-mono text-xs text-dim truncate">
      {summary}
    </span>
  );
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
          <div className="flex-1 min-w-0 overflow-hidden">
            <EventDataSummary event={event} />
          </div>
        </div>
      ))}
    </div>
  );
}

function TranscriptView({
  events,
  atEnd,
}: {
  events: SSEEvent[];
  atEnd: boolean;
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
            <span className="font-family-mono text-xs text-dim">
              {transcript.messageId}
            </span>
          )}
          {transcript.model != null && (
            <span className="font-family-mono text-xs text-dim">
              {transcript.model}
            </span>
          )}
        </div>
      )}
      <pre className="font-family-mono text-sm text-ink whitespace-pre-wrap p-3 flex-1">
        {transcript.text}
        {!atEnd && !transcript.isComplete && (
          <span className="inline-block w-[2px] h-[14px] bg-accent animate-pulse align-middle ml-px" />
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

  const segmentBase =
    "text-xs px-2 py-0.5 rounded cursor-pointer transition-colors";
  const segmentActive = "bg-bg-hl text-ink font-medium";
  const segmentInactive = "text-dim hover:text-ink";

  return (
    <div className="flex flex-col border border-border h-full overflow-hidden">
      <div className="flex items-center gap-3 px-3 h-[30px] shrink-0 bg-bg-sub border-b border-border">
        <div className="flex items-center gap-1.5 shrink-0">
          <span
            className={`inline-block w-[7px] h-[7px] rounded-full ${
              atEnd
                ? "bg-mid"
                : isFollowing
                  ? "bg-green-500 animate-pulse"
                  : "bg-amber-500"
            }`}
          />
          <span
            className={`text-xs ${
              atEnd
                ? "text-mid"
                : isFollowing
                  ? "text-green-500"
                  : "text-amber-500"
            }`}
          >
            {atEnd ? "complete" : isFollowing ? "live" : "paused"}
          </span>
        </div>
        <div className="flex items-center gap-0.5 bg-bg-pane rounded px-0.5 py-0.5">
          <button
            className={`${segmentBase} ${mode === "transcript" ? segmentActive : segmentInactive}`}
            onClick={() => setMode("transcript")}
          >
            transcript
          </button>
          <button
            className={`${segmentBase} ${mode === "events" ? segmentActive : segmentInactive}`}
            onClick={() => setMode("events")}
          >
            events
          </button>
        </div>
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
          {mode === "events" ? (
            <EventsView events={events} />
          ) : (
            <TranscriptView events={events} atEnd={atEnd} />
          )}
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
