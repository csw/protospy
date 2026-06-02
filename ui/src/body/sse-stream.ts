import type { BodyChunk } from "@bindings/BodyChunk";
import { parseSSEBlock } from "./sse";
import type { SSEEvent } from "./sse";

export type { SSEEvent };

/**
 * Immutable state for an incrementally-parsed SSE stream. Each `feedChunk`
 * call returns a NEW state with fresh `events` and `parserRemainder` — the
 * caller (the reducer) spreads this into the new `BodyState`.
 */
export interface SSEStreamState {
  /** Bounded array of parsed SSE events (newest at the end). */
  events: SSEEvent[];
  /** Monotonic total event count (survives eviction). */
  totalEventCount: number;
  /** Incomplete text from the last chunk boundary, carried forward. */
  parserRemainder: string;
}

/** Default cap on retained events. ~1 MB for typical event payloads. */
export const MAX_SSE_EVENTS = 10_000;

/** Create a fresh, empty SSE stream state. */
export function createSSEStreamState(): SSEStreamState {
  return { events: [], totalEventCount: 0, parserRemainder: "" };
}

/**
 * Extract text from a single `BodyChunk`. Text chunks return their string
 * directly; binary chunks are base64-decoded to bytes then UTF-8-decoded.
 */
export function chunkToText(chunk: BodyChunk): string {
  if ("text" in chunk) return chunk.text;
  const raw = atob(chunk.binary);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    bytes[i] = raw.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

/**
 * Feed a text chunk into the SSE stream state, returning a NEW state.
 * Parses only the new text (prepended with `parserRemainder`), splitting
 * on blank-line boundaries (`\n\n`). Incomplete trailing text is stored
 * as the new `parserRemainder`. This is O(chunk size), not O(total stream).
 */
export function feedChunk(
  prev: SSEStreamState,
  chunkText: string,
): SSEStreamState {
  const text = prev.parserRemainder + chunkText;
  const parts = text.split(/\n\n/);
  // The last element is either "" (text ended with \n\n) or an incomplete
  // block — carry it forward as the remainder.
  const remainder = parts.pop()!;

  let nextIndex = prev.totalEventCount;
  const newEvents: SSEEvent[] = [];

  for (const part of parts) {
    const event = parseSSEBlock(part, nextIndex);
    if (event != null) {
      newEvents.push(event);
      nextIndex++;
    }
  }

  return {
    events: [...prev.events, ...newEvents],
    totalEventCount: nextIndex,
    parserRemainder: remainder,
  };
}

/**
 * Enforce a retention cap on the event array. Returns a NEW state if events
 * were evicted, otherwise returns the same state unchanged (for identity
 * stability).
 */
export function applyRetention(
  state: SSEStreamState,
  max: number = MAX_SSE_EVENTS,
): SSEStreamState {
  if (state.events.length <= max) return state;
  return {
    ...state,
    events: state.events.slice(state.events.length - max),
  };
}
