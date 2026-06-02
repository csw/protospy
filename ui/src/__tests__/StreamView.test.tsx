import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { StreamView } from "@ui/components/StreamView";
import { ChatStreamView } from "@ui/components/anthropic/ChatStreamView";
import type { Exchange } from "@ui/state/reducer";
import { createSSEStreamState, feedChunk } from "@ui/body/sse-stream";

function makeSSEExchange(sseText: string, atEnd = true): Exchange {
  let sseState = createSSEStreamState();
  if (sseText) {
    sseState = feedChunk(sseState, sseText);
  }
  return {
    id: 1,
    timestamp: "2024-01-01T00:00:00Z",
    method: "POST",
    uri: "/v1/messages",
    responseBody: {
      chunks: [],
      atEnd,
      wireBytes: sseText.length,
      contentType: "text/event-stream",
      sseState,
    },
  };
}

/** Simulate scrolling away from the bottom so isFollowing becomes false. */
function simulateScrollAway(scrollEl: HTMLElement) {
  Object.defineProperty(scrollEl, "scrollHeight", {
    value: 500,
    configurable: true,
  });
  Object.defineProperty(scrollEl, "clientHeight", {
    value: 100,
    configurable: true,
  });
  Object.defineProperty(scrollEl, "scrollTop", {
    value: 0,
    configurable: true,
  });
  fireEvent.scroll(scrollEl);
}

const GENERIC_SSE =
  "event: ping\ndata: keepalive\n\nevent: message\ndata: hello\n\n";

describe("StreamView — generic SSE rendering", () => {
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

describe("StreamView — live indicator states", () => {
  it("shows 'complete' with gray dot when stream has ended", () => {
    render(<StreamView exchange={makeSSEExchange(GENERIC_SSE, true)} />);
    expect(screen.getByText("complete")).toBeInTheDocument();
    const dot = screen.getByTestId("indicator-dot");
    expect(dot).toHaveClass("bg-mid");
    expect(dot).not.toHaveClass("bg-green-500");
    expect(dot).not.toHaveClass("bg-amber-500");
  });

  it("shows 'live' with green pulsing dot when streaming and following", () => {
    render(<StreamView exchange={makeSSEExchange(GENERIC_SSE, false)} />);
    expect(screen.getByText("live")).toBeInTheDocument();
    const dot = screen.getByTestId("indicator-dot");
    expect(dot).toHaveClass("bg-green-500");
    expect(dot).toHaveClass("animate-pulse");
  });

  it("shows 'paused' with amber dot when streaming and scrolled away", () => {
    render(<StreamView exchange={makeSSEExchange(GENERIC_SSE, false)} />);
    const scrollEl = screen.getByTestId("stream-scroll");
    simulateScrollAway(scrollEl);
    expect(screen.getByText("paused")).toBeInTheDocument();
    const dot = screen.getByTestId("indicator-dot");
    expect(dot).toHaveClass("bg-amber-500");
    expect(dot).not.toHaveClass("animate-pulse");
  });
});

const ANTHROPIC_SSE = [
  'event: message_start\ndata: {"type":"message_start","message":{"id":"msg_01","model":"claude-3-5-sonnet-20241022"}}\n\n',
  'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hello!"}}\n\n',
  'event: message_stop\ndata: {"type":"message_stop"}\n\n',
].join("");

describe("ChatStreamView — Anthropic protocol", () => {
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

describe("ChatStreamView — live indicator states", () => {
  it("shows 'complete' with gray dot when stream has ended", () => {
    render(<ChatStreamView exchange={makeSSEExchange(ANTHROPIC_SSE, true)} />);
    expect(screen.getByText("complete")).toBeInTheDocument();
    const dot = screen.getByTestId("indicator-dot");
    expect(dot).toHaveClass("bg-mid");
    expect(dot).not.toHaveClass("bg-green-500");
    expect(dot).not.toHaveClass("bg-amber-500");
  });

  it("shows 'live' with green pulsing dot when streaming and following", () => {
    render(<ChatStreamView exchange={makeSSEExchange(ANTHROPIC_SSE, false)} />);
    expect(screen.getByText("live")).toBeInTheDocument();
    const dot = screen.getByTestId("indicator-dot");
    expect(dot).toHaveClass("bg-green-500");
    expect(dot).toHaveClass("animate-pulse");
  });

  it("shows 'paused' with amber dot when streaming and scrolled away", () => {
    render(<ChatStreamView exchange={makeSSEExchange(ANTHROPIC_SSE, false)} />);
    const scrollEl = screen.getByTestId("stream-scroll");
    simulateScrollAway(scrollEl);
    expect(screen.getByText("paused")).toBeInTheDocument();
    const dot = screen.getByTestId("indicator-dot");
    expect(dot).toHaveClass("bg-amber-500");
    expect(dot).not.toHaveClass("animate-pulse");
  });
});
