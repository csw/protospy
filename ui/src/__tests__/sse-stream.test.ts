import { describe, it, expect } from "vitest";
import {
  createSSEStreamState,
  feedChunk,
  applyRetention,
  chunkToText,
  MAX_SSE_EVENTS,
} from "@ui/body/sse-stream";

// ---------------------------------------------------------------------------
// chunkToText
// ---------------------------------------------------------------------------

describe("chunkToText", () => {
  it("returns text directly for text chunks", () => {
    expect(chunkToText({ text: "hello world" })).toBe("hello world");
  });

  it("decodes base64 binary chunks to UTF-8 text", () => {
    // btoa("hello") = "aGVsbG8="
    expect(chunkToText({ binary: "aGVsbG8=" })).toBe("hello");
  });
});

// ---------------------------------------------------------------------------
// feedChunk — basic parsing
// ---------------------------------------------------------------------------

describe("feedChunk", () => {
  it("parses a single complete event from one chunk", () => {
    const state = feedChunk(
      createSSEStreamState(),
      "event: ping\ndata: keepalive\n\n",
    );
    expect(state.events).toHaveLength(1);
    expect(state.events[0]).toMatchObject({
      type: "ping",
      data: "keepalive",
      index: 0,
    });
    expect(state.totalEventCount).toBe(1);
    expect(state.parserRemainder).toBe("");
  });

  it("parses multiple events from one chunk", () => {
    const state = feedChunk(
      createSSEStreamState(),
      "event: a\ndata: first\n\nevent: b\ndata: second\n\n",
    );
    expect(state.events).toHaveLength(2);
    expect(state.events[0].type).toBe("a");
    expect(state.events[1].type).toBe("b");
    expect(state.totalEventCount).toBe(2);
  });

  it("handles a partial event across two chunks", () => {
    let state = feedChunk(createSSEStreamState(), "event: message\ndata: hel");
    expect(state.events).toHaveLength(0);
    expect(state.parserRemainder).toBe("event: message\ndata: hel");
    expect(state.totalEventCount).toBe(0);

    state = feedChunk(state, "lo world\n\n");
    expect(state.events).toHaveLength(1);
    expect(state.events[0]).toMatchObject({
      type: "message",
      data: "hello world",
      index: 0,
    });
    expect(state.totalEventCount).toBe(1);
    expect(state.parserRemainder).toBe("");
  });

  it("handles empty chunk (no-op)", () => {
    const initial = createSSEStreamState();
    const state = feedChunk(initial, "");
    expect(state.events).toHaveLength(0);
    expect(state.parserRemainder).toBe("");
  });

  it("skips comment-only blocks", () => {
    const state = feedChunk(
      createSSEStreamState(),
      ": this is a comment\n\nevent: real\ndata: value\n\n",
    );
    expect(state.events).toHaveLength(1);
    expect(state.events[0].type).toBe("real");
  });

  it("handles multi-line data fields", () => {
    const state = feedChunk(
      createSSEStreamState(),
      "data: line1\ndata: line2\n\n",
    );
    expect(state.events).toHaveLength(1);
    expect(state.events[0].data).toBe("line1\nline2");
  });

  it("parses JSON data into parsedData", () => {
    const state = feedChunk(
      createSSEStreamState(),
      'data: {"key":"value"}\n\n',
    );
    expect(state.events[0].parsedData).toEqual({ key: "value" });
  });

  it("leaves parsedData undefined for non-JSON data", () => {
    const state = feedChunk(createSSEStreamState(), "data: plain text\n\n");
    expect(state.events[0].parsedData).toBeUndefined();
  });

  it("parses id field", () => {
    const state = feedChunk(
      createSSEStreamState(),
      "id: 42\ndata: with-id\n\n",
    );
    expect(state.events[0].id).toBe("42");
  });

  it("defaults event type to 'message'", () => {
    const state = feedChunk(createSSEStreamState(), "data: no-type\n\n");
    expect(state.events[0].type).toBe("message");
  });
});

// ---------------------------------------------------------------------------
// feedChunk — index continuity
// ---------------------------------------------------------------------------

describe("feedChunk index continuity", () => {
  it("continues indices across multiple feedChunk calls", () => {
    let state = feedChunk(
      createSSEStreamState(),
      "data: first\n\ndata: second\n\n",
    );
    expect(state.events[0].index).toBe(0);
    expect(state.events[1].index).toBe(1);
    expect(state.totalEventCount).toBe(2);

    state = feedChunk(state, "data: third\n\n");
    expect(state.events[2].index).toBe(2);
    expect(state.totalEventCount).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// feedChunk — immutability
// ---------------------------------------------------------------------------

describe("feedChunk immutability", () => {
  it("returns a new state object (does not mutate the original)", () => {
    const original = createSSEStreamState();
    const next = feedChunk(original, "data: hello\n\n");
    expect(next).not.toBe(original);
    expect(original.events).toHaveLength(0);
    expect(original.totalEventCount).toBe(0);
    expect(next.events).toHaveLength(1);
  });

  it("returns a new events array", () => {
    const first = feedChunk(createSSEStreamState(), "data: a\n\n");
    const second = feedChunk(first, "data: b\n\n");
    expect(second.events).not.toBe(first.events);
    expect(first.events).toHaveLength(1);
    expect(second.events).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// applyRetention
// ---------------------------------------------------------------------------

describe("applyRetention", () => {
  it("returns the same state when under the limit", () => {
    const state = feedChunk(createSSEStreamState(), "data: a\n\n");
    const retained = applyRetention(state, 100);
    expect(retained).toBe(state); // identity — no allocation
  });

  it("returns the same state when at the limit", () => {
    const state = feedChunk(createSSEStreamState(), "data: a\n\n");
    const retained = applyRetention(state, 1);
    expect(retained).toBe(state);
  });

  it("evicts oldest events when over the limit", () => {
    let state = createSSEStreamState();
    for (let i = 0; i < 5; i++) {
      state = feedChunk(state, `data: event-${i}\n\n`);
    }
    expect(state.events).toHaveLength(5);
    expect(state.totalEventCount).toBe(5);

    const retained = applyRetention(state, 3);
    expect(retained).not.toBe(state);
    expect(retained.events).toHaveLength(3);
    // Kept the newest 3 (indices 2, 3, 4)
    expect(retained.events[0].index).toBe(2);
    expect(retained.events[2].index).toBe(4);
    // totalEventCount preserved
    expect(retained.totalEventCount).toBe(5);
  });

  it("uses MAX_SSE_EVENTS as default limit", () => {
    // Just verify it doesn't throw with the default
    const state = feedChunk(createSSEStreamState(), "data: a\n\n");
    const retained = applyRetention(state);
    expect(retained).toBe(state);
    expect(MAX_SSE_EVENTS).toBe(10_000);
  });
});
