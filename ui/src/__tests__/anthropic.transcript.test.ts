import { describe, it, expect } from "vitest";
import { extractAnthropicTranscript } from "@ui/anthropic/transcript";
import type { SSEEvent } from "@ui/body/sse";

function makeEvent(
  type: string,
  data: Record<string, unknown>,
  index: number,
): SSEEvent {
  const dataStr = JSON.stringify(data);
  return { type, data: dataStr, parsedData: data, index };
}

describe("extractAnthropicTranscript", () => {
  it("returns empty transcript for no events", () => {
    const result = extractAnthropicTranscript([]);
    expect(result.text).toBe("");
    expect(result.isComplete).toBe(false);
    expect(result.model).toBeUndefined();
  });

  it("extracts model and messageId from message_start", () => {
    const events = [
      makeEvent(
        "message_start",
        { message: { id: "msg_01XYZ", model: "claude-3-5-sonnet-20241022" } },
        0,
      ),
    ];
    const result = extractAnthropicTranscript(events);
    expect(result.model).toBe("claude-3-5-sonnet-20241022");
    expect(result.messageId).toBe("msg_01XYZ");
  });

  it("accumulates text from content_block_delta events", () => {
    const events = [
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
    const events = [
      makeEvent(
        "content_block_delta",
        { delta: { type: "input_json_delta", partial_json: '{"k":' } },
        0,
      ),
    ];
    const result = extractAnthropicTranscript(events);
    expect(result.text).toBe("");
  });

  it("extracts stop_reason and usage from message_delta", () => {
    const events = [
      makeEvent(
        "message_delta",
        { delta: { stop_reason: "end_turn" }, usage: { output_tokens: 42 } },
        0,
      ),
    ];
    const result = extractAnthropicTranscript(events);
    expect(result.stopReason).toBe("end_turn");
    expect(result.usage?.output_tokens).toBe(42);
  });

  it("sets isComplete when message_stop is seen", () => {
    const events = [makeEvent("message_stop", { type: "message_stop" }, 0)];
    const result = extractAnthropicTranscript(events);
    expect(result.isComplete).toBe(true);
  });

  it("extracts full Anthropic transcript end-to-end", () => {
    const events: SSEEvent[] = [
      makeEvent(
        "message_start",
        { message: { id: "msg_01ABC", model: "claude-opus-4-6" } },
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
      { type: "message", data: "42", parsedData: 42, index: 1 },
    ];
    const result = extractAnthropicTranscript(events);
    expect(result.text).toBe("");
    expect(result.isComplete).toBe(false);
  });

  it("skips content_block_delta whose delta is missing a type", () => {
    const events = [
      makeEvent(
        "content_block_delta",
        { delta: { text: "should be ignored" } },
        0,
      ),
    ];
    const result = extractAnthropicTranscript(events);
    expect(result.text).toBe("");
  });

  it("handles message_start with no message field gracefully", () => {
    const events = [makeEvent("message_start", { type: "message_start" }, 0)];
    const result = extractAnthropicTranscript(events);
    expect(result.model).toBeUndefined();
    expect(result.messageId).toBeUndefined();
  });
});
