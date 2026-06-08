import { describe, it, expect } from "vitest";
import {
  classifyEvent,
  readEventStream,
  type EventClass,
} from "@ui/body/event-stream";
import type { SSEEvent } from "@ui/body/sse";
import type { BodyState } from "@ui/state/reducer";
import { createSSEStreamState, feedChunk } from "@ui/body/sse-stream";

function makeEvent(overrides: Partial<SSEEvent> = {}): SSEEvent {
  return { type: "message", data: "hello", index: 0, ...overrides };
}

describe("classifyEvent", () => {
  it("classifies every live SSEEvent as generic (one variant today)", () => {
    const cases: SSEEvent[] = [
      makeEvent({ type: "message_start" }),
      makeEvent({ type: "content_block_delta" }),
      makeEvent({ type: "ping" }),
      makeEvent({ type: "totally-unknown" }),
    ];
    for (const e of cases) {
      const klass: EventClass = classifyEvent(e);
      expect(klass.kind).toBe("generic");
    }
  });

  it("does not depend on parsedData or index (consumes the live shape directly)", () => {
    expect(
      classifyEvent(makeEvent({ parsedData: { foo: 1 }, index: 42 })).kind,
    ).toBe("generic");
  });
});

describe("readEventStream", () => {
  it("returns an empty, ended view for an undefined body", () => {
    expect(readEventStream(undefined)).toEqual({
      events: [],
      totalEventCount: 0,
      atEnd: true,
    });
  });

  it("surfaces parsed events and the eviction-surviving total count", () => {
    const sseState = feedChunk(
      createSSEStreamState(),
      "event: ping\ndata: a\n\nevent: message\ndata: b\n\n",
    );
    const body: BodyState = {
      chunks: [],
      atEnd: false,
      wireBytes: 10,
      contentType: "text/event-stream",
      sseState,
    };
    const view = readEventStream(body);
    expect(view.events.map((e) => e.type)).toEqual(["ping", "message"]);
    expect(view.totalEventCount).toBe(2);
    expect(view.atEnd).toBe(false);
  });

  it("reports atEnd once the body has ended", () => {
    const body: BodyState = {
      chunks: [],
      atEnd: true,
      wireBytes: 0,
      contentType: "text/event-stream",
      sseState: createSSEStreamState(),
    };
    expect(readEventStream(body).atEnd).toBe(true);
  });

  it("falls back to events.length when sseState is absent", () => {
    const body: BodyState = {
      chunks: [],
      atEnd: true,
      wireBytes: 0,
      contentType: "application/json",
    };
    const view = readEventStream(body);
    expect(view.events).toEqual([]);
    expect(view.totalEventCount).toBe(0);
  });
});
