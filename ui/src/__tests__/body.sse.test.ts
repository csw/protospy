import { describe, it, expect } from "vitest";
import { parseSSEBody, chunksToText } from "@ui/body/sse";
import type { BodyState } from "@ui/state/reducer";

describe("parseSSEBody", () => {
  it("returns empty array for empty string", () => {
    expect(parseSSEBody("")).toEqual([]);
  });

  it("returns empty array for whitespace-only string", () => {
    expect(parseSSEBody("   \n\n  ")).toEqual([]);
  });

  it("parses a single simple message event", () => {
    const text = "data: hello\n\n";
    const events = parseSSEBody(text);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("message");
    expect(events[0].data).toBe("hello");
    expect(events[0].index).toBe(0);
  });

  it("parses event type field", () => {
    const text = "event: message_start\ndata: {}\n\n";
    const events = parseSSEBody(text);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("message_start");
  });

  it("parses event id field", () => {
    const text = "id: 42\ndata: test\n\n";
    const events = parseSSEBody(text);
    expect(events).toHaveLength(1);
    expect(events[0].id).toBe("42");
  });

  it("concatenates multiple data lines with newline", () => {
    const text = "data: line1\ndata: line2\ndata: line3\n\n";
    const events = parseSSEBody(text);
    expect(events).toHaveLength(1);
    expect(events[0].data).toBe("line1\nline2\nline3");
  });

  it("skips comment lines starting with colon", () => {
    const text = ": this is a comment\ndata: hello\n\n";
    const events = parseSSEBody(text);
    expect(events).toHaveLength(1);
    expect(events[0].data).toBe("hello");
  });

  it("skips blocks with no data lines", () => {
    const text = "event: ping\n\ndata: actual\n\n";
    const events = parseSSEBody(text);
    expect(events).toHaveLength(1);
    expect(events[0].data).toBe("actual");
  });

  it("parses multiple events and assigns sequential indices", () => {
    const text = "data: first\n\ndata: second\n\ndata: third\n\n";
    const events = parseSSEBody(text);
    expect(events).toHaveLength(3);
    expect(events[0].index).toBe(0);
    expect(events[1].index).toBe(1);
    expect(events[2].index).toBe(2);
  });

  it("parses JSON data into parsedData", () => {
    const obj = { type: "text_delta", text: "Hello" };
    const text = `data: ${JSON.stringify(obj)}\n\n`;
    const events = parseSSEBody(text);
    expect(events[0].parsedData).toEqual(obj);
  });

  it("leaves parsedData undefined for non-JSON data", () => {
    const text = "data: not-json\n\n";
    const events = parseSSEBody(text);
    expect(events[0].parsedData).toBeUndefined();
  });

  it("handles Anthropic-style SSE stream", () => {
    const text = [
      'event: message_start\ndata: {"type":"message_start","message":{"id":"msg_01","model":"claude-3-5-sonnet-20241022"}}\n\n',
      'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hello"}}\n\n',
      'event: message_stop\ndata: {"type":"message_stop"}\n\n',
    ].join("");
    const events = parseSSEBody(text);
    expect(events).toHaveLength(3);
    expect(events[0].type).toBe("message_start");
    expect(events[1].type).toBe("content_block_delta");
    expect(events[2].type).toBe("message_stop");
  });

  it("strips leading space from value after colon", () => {
    const text = "event: ping\ndata: { }\n\n";
    const events = parseSSEBody(text);
    expect(events[0].data).toBe("{ }");
  });

  it("ignores lines without a colon", () => {
    const text = "justaplainline\ndata: hello\n\n";
    const events = parseSSEBody(text);
    expect(events).toHaveLength(1);
    expect(events[0].data).toBe("hello");
  });
});

describe("parseSSEBody field-parsing robustness", () => {
  it("preserves colons in the value (splits only on the first colon)", () => {
    const text = "data: a:b:c\n\n";
    const events = parseSSEBody(text);
    expect(events).toHaveLength(1);
    expect(events[0].data).toBe("a:b:c");
  });

  it("drops blocks whose only line lacks a colon (no data accumulated)", () => {
    // Per implementation: lines without a colon are skipped entirely, so a
    // block consisting solely of such a line produces no event.
    const text = "hello\n\n";
    const events = parseSSEBody(text);
    expect(events).toEqual([]);
  });

  it("ignores blocks that contain only a comment line", () => {
    const text = ": this is a comment\n\n";
    const events = parseSSEBody(text);
    expect(events).toEqual([]);
  });

  it("concatenates multiple consecutive data lines with newline", () => {
    const text = "data: alpha\ndata: beta\ndata: gamma\n\n";
    const events = parseSSEBody(text);
    expect(events).toHaveLength(1);
    expect(events[0].data).toBe("alpha\nbeta\ngamma");
  });
});

describe("chunksToText", () => {
  it("returns empty string for a body with no chunks", () => {
    const body: BodyState = { chunks: [], atEnd: true, wireBytes: 0 };
    expect(chunksToText(body)).toBe("");
  });

  it("decodes a single text chunk", () => {
    const body: BodyState = {
      chunks: [{ text: "hello" }],
      atEnd: true,
      wireBytes: 5,
    };
    expect(chunksToText(body)).toBe("hello");
  });

  it("concatenates multiple text chunks in order", () => {
    const body: BodyState = {
      chunks: [{ text: "foo" }, { text: "bar" }],
      atEnd: true,
      wireBytes: 6,
    };
    expect(chunksToText(body)).toBe("foobar");
  });

  it("decodes a base64 binary chunk to UTF-8", () => {
    const body: BodyState = {
      chunks: [{ binary: "aGVsbG8=" }],
      atEnd: true,
      wireBytes: 5,
    };
    expect(chunksToText(body)).toBe("hello");
  });

  it("mixes text and binary chunks", () => {
    const body: BodyState = {
      chunks: [{ text: "hello " }, { binary: "d29ybGQ=" }],
      atEnd: true,
      wireBytes: 11,
    };
    expect(chunksToText(body)).toBe("hello world");
  });
});
