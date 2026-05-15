import { useMemo, useRef, useEffect, useState, useCallback } from "react";
import type { Exchange, BodyState } from "@ui/state/reducer";
import type { BodyChunk } from "@bindings/BodyChunk";
import { parseSSEBody, extractAnthropicTranscript } from "@ui/body/sse";
import type { SSEEvent } from "@ui/body/sse";

interface Props {
  exchange: Exchange;
}

// Convert body chunks to a UTF-8 text string, properly handling binary chunks
function chunksToText(body: BodyState): string {
  const arrays = body.chunks.map((chunk: BodyChunk) => {
    if ("text" in chunk) {
      return new TextEncoder().encode(chunk.text);
    } else {
      // base64 decode
      const raw = atob(chunk.binary);
      const bytes = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) {
        bytes[i] = raw.charCodeAt(i);
      }
      return bytes;
    }
  });

  const totalLength = arrays.reduce((sum, a) => sum + a.byteLength, 0);
  const combined = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    combined.set(arr, offset);
    offset += arr.byteLength;
  }
  return new TextDecoder().decode(combined);
}

function eventTypeBadgeClass(type: string): string {
  switch (type) {
    case "message_start":
      return "text-purple-500 bg-purple-500/10";
    case "content_block_start":
    case "content_block_stop":
    case "content_block_delta":
      return "text-green bg-green-500/10";
    case "message_delta":
      return "text-accent bg-accent/10";
    case "message_stop":
      return "text-mid bg-bg-sub";
    case "ping":
      return "text-dim bg-bg-sub";
    default:
      return "text-ink-2 bg-bg-sub";
  }
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
          {/* Index */}
          <span className="font-family-mono text-xs text-dim shrink-0 w-6 text-right">
            {event.index}
          </span>

          {/* Event type badge */}
          <span
            className={`font-family-mono text-xs px-1.5 py-0.5 rounded shrink-0 ${eventTypeBadgeClass(event.type)}`}
          >
            {event.type}
          </span>

          {/* Data summary */}
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
      {/* Model / message ID header */}
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

      {/* Main text */}
      <pre className="font-family-mono text-sm text-ink whitespace-pre-wrap p-3 flex-1">
        {transcript.text}
        {/* Blinking cursor when streaming */}
        {!atEnd && !transcript.isComplete && (
          <span className="inline-block w-[2px] h-[14px] bg-accent animate-pulse align-middle ml-px" />
        )}
      </pre>

      {/* Completion footer */}
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

export function StreamView({ exchange }: Props) {
  const [mode, setMode] = useState<Mode>("events");
  const [isFollowing, setIsFollowing] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  const body = exchange.responseBody;
  const atEnd = body?.atEnd ?? true;

  // Parse SSE events, re-parse when chunks are added or stream ends
  const events = useMemo(() => {
    if (!body) return [];
    const text = chunksToText(body);
    return parseSSEBody(text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [body?.chunks.length, body?.atEnd]);

  // Auto-scroll when following
  useEffect(() => {
    if (!isFollowing) return;
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [events, isFollowing]);

  // Detect when user scrolls away from bottom
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setIsFollowing(distFromBottom < 40);
  }, []);

  const jumpToLatest = useCallback(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
    setIsFollowing(true);
  }, []);

  const segmentBase =
    "text-xs px-2 py-0.5 rounded cursor-pointer transition-colors";
  const segmentActive = "bg-bg-hl text-ink font-medium";
  const segmentInactive = "text-dim hover:text-ink";

  return (
    <div className="flex flex-col border border-border h-full overflow-hidden">
      {/* Head bar (30px) */}
      <div className="flex items-center gap-3 px-3 h-[30px] shrink-0 bg-bg-sub border-b border-border">
        {/* Live/complete indicator */}
        <div className="flex items-center gap-1.5 shrink-0">
          <span
            className={`inline-block w-[7px] h-[7px] rounded-full ${
              !atEnd ? "bg-green-500 animate-pulse" : "bg-mid"
            }`}
          />
          <span className={`text-xs ${!atEnd ? "text-green-500" : "text-mid"}`}>
            {!atEnd ? "live" : "complete"}
          </span>
        </div>

        {/* Mode toggle */}
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

        {/* Event count */}
        <span className="ml-auto text-xs text-dim font-family-mono">
          {events.length} events
        </span>
      </div>

      {/* Content area */}
      <div className="relative flex flex-col flex-1 overflow-hidden">
        <div
          ref={scrollRef}
          className="flex flex-col flex-1 overflow-auto"
          onScroll={handleScroll}
        >
          {mode === "events" ? (
            <EventsView events={events} />
          ) : (
            <TranscriptView events={events} atEnd={atEnd} />
          )}
        </div>

        {/* Jump to latest pill */}
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
