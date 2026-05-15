import { describe, it, expect } from "vitest";
import { parseSSEBody, extractAnthropicTranscript } from "@ui/body/sse";
import type { SSEEvent } from "@ui/body/sse";

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

describe("extractAnthropicTranscript", () => {
  function makeEvent(
    type: string,
    data: Record<string, unknown>,
    index: number,
  ): SSEEvent {
    const dataStr = JSON.stringify(data);
    return {
      type,
      data: dataStr,
      parsedData: data,
      index,
    };
  }

  it("returns empty transcript for no events", () => {
    const result = extractAnthropicTranscript([]);
    expect(result.text).toBe("");
    expect(result.isComplete).toBe(false);
    expect(result.model).toBeUndefined();
  });

  it("extracts model and messageId from message_start", () => {
    const events: SSEEvent[] = [
      makeEvent(
        "message_start",
        {
          message: {
            id: "msg_01XYZ",
            model: "claude-3-5-sonnet-20241022",
          },
        },
        0,
      ),
    ];
    const result = extractAnthropicTranscript(events);
    expect(result.model).toBe("claude-3-5-sonnet-20241022");
    expect(result.messageId).toBe("msg_01XYZ");
  });

  it("accumulates text from content_block_delta events", () => {
    const events: SSEEvent[] = [
      makeEvent(
        "content_block_delta",
        { delta: { type: "text_delta", text: "Hello, " } },
        0,
      ),
      makeEvent(
        "content_block_delta",
        { delta: { type: "text_delta", text: "world!" } },
        1,
      ),
    ];
    const result = extractAnthropicTranscript(events);
    expect(result.text).toBe("Hello, world!");
  });

  it("ignores non-text_delta deltas", () => {
    const events: SSEEvent[] = [
      makeEvent(
        "content_block_delta",
        { delta: { type: "input_json_delta", partial_json: '{"k":' } },
        0,
      ),
    ];
    const result = extractAnthropicTranscript(events);
    expect(result.text).toBe("");
  });

  it("extracts stop_reason from message_delta", () => {
    const events: SSEEvent[] = [
      makeEvent(
        "message_delta",
        {
          delta: { stop_reason: "end_turn" },
          usage: { output_tokens: 42 },
        },
        0,
      ),
    ];
    const result = extractAnthropicTranscript(events);
    expect(result.stopReason).toBe("end_turn");
    expect(result.usage?.output_tokens).toBe(42);
  });

  it("sets isComplete when message_stop is seen", () => {
    const events: SSEEvent[] = [
      makeEvent("message_stop", { type: "message_stop" }, 0),
    ];
    const result = extractAnthropicTranscript(events);
    expect(result.isComplete).toBe(true);
  });

  it("extracts full Anthropic transcript end-to-end", () => {
    const events: SSEEvent[] = [
      makeEvent(
        "message_start",
        {
          message: {
            id: "msg_01ABC",
            model: "claude-opus-4-6",
          },
        },
        0,
      ),
      makeEvent("content_block_start", { content_block: { type: "text" } }, 1),
      makeEvent(
        "content_block_delta",
        { delta: { type: "text_delta", text: "The answer is " } },
        2,
      ),
      makeEvent(
        "content_block_delta",
        { delta: { type: "text_delta", text: "42." } },
        3,
      ),
      makeEvent("content_block_stop", {}, 4),
      makeEvent(
        "message_delta",
        {
          delta: { stop_reason: "end_turn", stop_sequence: null },
          usage: { output_tokens: 10 },
        },
        5,
      ),
      makeEvent("message_stop", { type: "message_stop" }, 6),
    ];
    const result = extractAnthropicTranscript(events);
    expect(result.text).toBe("The answer is 42.");
    expect(result.model).toBe("claude-opus-4-6");
    expect(result.messageId).toBe("msg_01ABC");
    expect(result.stopReason).toBe("end_turn");
    expect(result.usage?.output_tokens).toBe(10);
    expect(result.isComplete).toBe(true);
  });

  it("ignores events with non-object parsedData", () => {
    const events: SSEEvent[] = [
      { type: "message", data: "plain text", parsedData: undefined, index: 0 },
      {
        type: "message",
        data: "42",
        parsedData: 42,
        index: 1,
      },
    ];
    const result = extractAnthropicTranscript(events);
    expect(result.text).toBe("");
    expect(result.isComplete).toBe(false);
  });
});
