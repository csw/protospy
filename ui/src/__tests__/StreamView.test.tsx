import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { StreamView } from "@ui/components/StreamView";
import { ChatStreamView } from "@ui/components/anthropic/ChatStreamView";
import type { Exchange } from "@ui/state/reducer";

function makeSSEExchange(sseText: string): Exchange {
  return {
    id: 1,
    timestamp: "2024-01-01T00:00:00Z",
    method: "POST",
    uri: "/v1/messages",
    responseBody: {
      chunks: [{ text: sseText }],
      atEnd: true,
      totalBytes: sseText.length,
      contentType: "text/event-stream",
    },
  };
}

const GENERIC_SSE =
  "event: ping\ndata: keepalive\n\nevent: message\ndata: hello\n\n";

describe("StreamView — generic SSE rendering", () => {
  afterEach(cleanup);

  it("renders events when given SSE body", () => {
    render(<StreamView exchange={makeSSEExchange(GENERIC_SSE)} />);
    expect(screen.getByText("ping")).toBeInTheDocument();
    expect(screen.getByText("message")).toBeInTheDocument();
  });

  it("does NOT render a transcript/events toggle", () => {
    render(<StreamView exchange={makeSSEExchange(GENERIC_SSE)} />);
    expect(screen.queryByText("transcript")).not.toBeInTheDocument();
  });

  it("shows 'No events yet' when body is empty", () => {
    render(<StreamView exchange={makeSSEExchange("")} />);
    expect(screen.getByText("No events yet")).toBeInTheDocument();
  });

  it("shows event count in header", () => {
    render(<StreamView exchange={makeSSEExchange(GENERIC_SSE)} />);
    expect(screen.getByText("2 events")).toBeInTheDocument();
  });

  it("applies color-coded badge class for ping events", () => {
    render(<StreamView exchange={makeSSEExchange(GENERIC_SSE)} />);
    const badge = screen.getByText("ping");
    expect(badge).toHaveClass("text-dim");
    expect(badge).toHaveClass("bg-bg-sub");
  });

  it("applies default badge class for unknown event types", () => {
    render(<StreamView exchange={makeSSEExchange(GENERIC_SSE)} />);
    const badge = screen.getByText("message");
    expect(badge).toHaveClass("text-ink-2");
    expect(badge).toHaveClass("bg-bg-sub");
  });
});

const ANTHROPIC_SSE = [
  'event: message_start\ndata: {"type":"message_start","message":{"id":"msg_01","model":"claude-3-5-sonnet-20241022"}}\n\n',
  'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hello!"}}\n\n',
  'event: message_stop\ndata: {"type":"message_stop"}\n\n',
].join("");

describe("ChatStreamView — Anthropic protocol", () => {
  afterEach(cleanup);

  it("renders the transcript/events mode toggle", () => {
    render(<ChatStreamView exchange={makeSSEExchange(ANTHROPIC_SSE)} />);
    expect(screen.getByText("transcript")).toBeInTheDocument();
    expect(screen.getByText("events")).toBeInTheDocument();
  });

  it("shows event types in events mode (default)", () => {
    render(<ChatStreamView exchange={makeSSEExchange(ANTHROPIC_SSE)} />);
    expect(screen.getByText("message_start")).toBeInTheDocument();
  });

  it("applies purple badge class for message_start events", () => {
    render(<ChatStreamView exchange={makeSSEExchange(ANTHROPIC_SSE)} />);
    const badge = screen.getByText("message_start");
    expect(badge).toHaveClass("text-purple-500");
    expect(badge).toHaveClass("bg-purple-500/10");
  });

  it("shows 'No events yet' when body is empty", () => {
    render(<ChatStreamView exchange={makeSSEExchange("")} />);
    expect(screen.getByText("No events yet")).toBeInTheDocument();
  });
});
