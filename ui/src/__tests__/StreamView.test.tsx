import { describe, it, expect } from "vitest";
import { screen, fireEvent, act } from "@testing-library/react";
import { render } from "@ui/test/render";
import { StreamView } from "@ui/components/StreamView";
import { ChatStreamView } from "@ui/components/anthropic/ChatStreamView";
import type { Exchange } from "@ui/state/reducer";
import { createSSEStreamState, feedChunk } from "@ui/body/sse-stream";

function makeSSEExchange(
  sseText: string,
  atEnd = true,
  error?: Exchange["error"],
): Exchange {
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
    error,
  };
}

/**
 * Render and wait for the virtualizer to settle. The EventsView
 * virtualizer calculates its visible range in a layout effect and
 * triggers a state-driven re-render to show items. An explicit act()
 * flush is needed so the test sees the rendered rows.
 */
async function renderAndSettle(ui: React.ReactElement) {
  const result = render(ui);
  await act(async () => {});
  return result;
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
  it("renders events when given SSE body", async () => {
    await renderAndSettle(
      <StreamView exchange={makeSSEExchange(GENERIC_SSE)} />,
    );
    expect(screen.getByText("ping")).toBeInTheDocument();
    expect(screen.getByText("message")).toBeInTheDocument();
  });

  it("does NOT render a transcript/events toggle", async () => {
    await renderAndSettle(
      <StreamView exchange={makeSSEExchange(GENERIC_SSE)} />,
    );
    expect(screen.queryByText("transcript")).not.toBeInTheDocument();
  });

  it("shows 'No events yet' when body is empty", async () => {
    await renderAndSettle(<StreamView exchange={makeSSEExchange("")} />);
    expect(screen.getByText("No events yet")).toBeInTheDocument();
  });

  it("shows event count in header", async () => {
    await renderAndSettle(
      <StreamView exchange={makeSSEExchange(GENERIC_SSE)} />,
    );
    expect(screen.getByText("2 events")).toBeInTheDocument();
  });

  it("applies color-coded badge class for ping events", async () => {
    await renderAndSettle(
      <StreamView exchange={makeSSEExchange(GENERIC_SSE)} />,
    );
    const badge = screen.getByText("ping");
    expect(badge).toHaveClass("text-dim");
    expect(badge).toHaveClass("bg-bg-sub");
  });

  it("applies default badge class for unknown event types", async () => {
    await renderAndSettle(
      <StreamView exchange={makeSSEExchange(GENERIC_SSE)} />,
    );
    const badge = screen.getByText("message");
    expect(badge).toHaveClass("text-ink-2");
    expect(badge).toHaveClass("bg-bg-sub");
  });
});

describe("StreamView — 'Jump to latest' button", () => {
  it("shows 'Jump to latest' when streaming and scrolled away", async () => {
    await renderAndSettle(
      <StreamView exchange={makeSSEExchange(GENERIC_SSE, false)} />,
    );
    const scrollEl = screen.getByTestId("stream-scroll");
    simulateScrollAway(scrollEl);
    expect(screen.getByText("Jump to latest")).toBeInTheDocument();
  });

  it("does not show 'Jump to latest' when following", async () => {
    await renderAndSettle(
      <StreamView exchange={makeSSEExchange(GENERIC_SSE, false)} />,
    );
    expect(screen.queryByText("Jump to latest")).not.toBeInTheDocument();
  });

  it("does not show 'Jump to latest' when stream has ended", async () => {
    await renderAndSettle(
      <StreamView exchange={makeSSEExchange(GENERIC_SSE, true)} />,
    );
    const scrollEl = screen.getByTestId("stream-scroll");
    simulateScrollAway(scrollEl);
    expect(screen.queryByText("Jump to latest")).not.toBeInTheDocument();
  });
});

describe("StreamView — live indicator states", () => {
  it("shows 'complete' with gray dot when stream has ended", async () => {
    await renderAndSettle(
      <StreamView exchange={makeSSEExchange(GENERIC_SSE, true)} />,
    );
    expect(screen.getByText("complete")).toBeInTheDocument();
    const dot = screen.getByTestId("indicator-dot");
    expect(dot).toHaveClass("bg-mid");
    expect(dot).not.toHaveClass("bg-green");
    expect(dot).not.toHaveClass("bg-amber");
  });

  it("shows 'live' with green pulsing dot when streaming and following", async () => {
    await renderAndSettle(
      <StreamView exchange={makeSSEExchange(GENERIC_SSE, false)} />,
    );
    expect(screen.getByText("live")).toBeInTheDocument();
    const dot = screen.getByTestId("indicator-dot");
    expect(dot).toHaveClass("bg-green");
    expect(dot).toHaveClass("animate-pulse");
  });

  it("shows 'paused' with amber dot when streaming and scrolled away", async () => {
    await renderAndSettle(
      <StreamView exchange={makeSSEExchange(GENERIC_SSE, false)} />,
    );
    const scrollEl = screen.getByTestId("stream-scroll");
    simulateScrollAway(scrollEl);
    expect(screen.getByText("paused")).toBeInTheDocument();
    const dot = screen.getByTestId("indicator-dot");
    expect(dot).toHaveClass("bg-amber");
    expect(dot).not.toHaveClass("animate-pulse");
  });
});

describe("StreamView — error/disconnected state", () => {
  const RESPONSE_ERROR: Exchange["error"] = {
    direction: "Response",
    message: "connection reset by peer",
  };

  it("shows 'disconnected' with red dot when exchange has Response error", async () => {
    await renderAndSettle(
      <StreamView
        exchange={makeSSEExchange(GENERIC_SSE, false, RESPONSE_ERROR)}
      />,
    );
    expect(screen.getByText("disconnected")).toBeInTheDocument();
    const dot = screen.getByTestId("indicator-dot");
    expect(dot).toHaveClass("bg-red");
    expect(dot).not.toHaveClass("animate-pulse");
  });

  it("hides 'Jump to latest' button when disconnected", async () => {
    await renderAndSettle(
      <StreamView
        exchange={makeSSEExchange(GENERIC_SSE, false, RESPONSE_ERROR)}
      />,
    );
    const scrollEl = screen.getByTestId("stream-scroll");
    simulateScrollAway(scrollEl);
    expect(screen.queryByText("Jump to latest")).not.toBeInTheDocument();
  });

  it("ignores Request-direction errors (not an SSE disconnect)", async () => {
    const requestError: Exchange["error"] = {
      direction: "Request",
      message: "connection refused",
    };
    await renderAndSettle(
      <StreamView
        exchange={makeSSEExchange(GENERIC_SSE, false, requestError)}
      />,
    );
    expect(screen.getByText("live")).toBeInTheDocument();
  });
});

const ANTHROPIC_SSE = [
  'event: message_start\ndata: {"type":"message_start","message":{"id":"msg_01","model":"claude-3-5-sonnet-20241022"}}\n\n',
  'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hello!"}}\n\n',
  'event: message_stop\ndata: {"type":"message_stop"}\n\n',
].join("");

describe("ChatStreamView — Anthropic protocol", () => {
  it("renders the transcript/events mode toggle", async () => {
    await renderAndSettle(
      <ChatStreamView exchange={makeSSEExchange(ANTHROPIC_SSE)} />,
    );
    expect(screen.getByText("transcript")).toBeInTheDocument();
    expect(screen.getByText("events")).toBeInTheDocument();
  });

  it("shows event types in events mode (default)", async () => {
    await renderAndSettle(
      <ChatStreamView exchange={makeSSEExchange(ANTHROPIC_SSE)} />,
    );
    expect(screen.getByText("message_start")).toBeInTheDocument();
  });

  it("applies purple badge class for message_start events", async () => {
    await renderAndSettle(
      <ChatStreamView exchange={makeSSEExchange(ANTHROPIC_SSE)} />,
    );
    const badge = screen.getByText("message_start");
    expect(badge).toHaveClass("text-purple-500");
    expect(badge).toHaveClass("bg-purple-500/10");
  });

  it("shows 'No events yet' when body is empty", async () => {
    await renderAndSettle(<ChatStreamView exchange={makeSSEExchange("")} />);
    expect(screen.getByText("No events yet")).toBeInTheDocument();
  });
});

describe("ChatStreamView — 'Jump to latest' button", () => {
  it("shows 'Jump to latest' when streaming and scrolled away", async () => {
    await renderAndSettle(
      <ChatStreamView exchange={makeSSEExchange(ANTHROPIC_SSE, false)} />,
    );
    const scrollEl = screen.getByTestId("stream-scroll");
    simulateScrollAway(scrollEl);
    expect(screen.getByText("Jump to latest")).toBeInTheDocument();
  });

  it("does not show 'Jump to latest' when following", async () => {
    await renderAndSettle(
      <ChatStreamView exchange={makeSSEExchange(ANTHROPIC_SSE, false)} />,
    );
    expect(screen.queryByText("Jump to latest")).not.toBeInTheDocument();
  });

  it("does not show 'Jump to latest' when stream has ended", async () => {
    await renderAndSettle(
      <ChatStreamView exchange={makeSSEExchange(ANTHROPIC_SSE, true)} />,
    );
    const scrollEl = screen.getByTestId("stream-scroll");
    simulateScrollAway(scrollEl);
    expect(screen.queryByText("Jump to latest")).not.toBeInTheDocument();
  });
});

describe("ChatStreamView — live indicator states", () => {
  it("shows 'complete' with gray dot when stream has ended", async () => {
    await renderAndSettle(
      <ChatStreamView exchange={makeSSEExchange(ANTHROPIC_SSE, true)} />,
    );
    expect(screen.getByText("complete")).toBeInTheDocument();
    const dot = screen.getByTestId("indicator-dot");
    expect(dot).toHaveClass("bg-mid");
    expect(dot).not.toHaveClass("bg-green");
    expect(dot).not.toHaveClass("bg-amber");
  });

  it("shows 'live' with green pulsing dot when streaming and following", async () => {
    await renderAndSettle(
      <ChatStreamView exchange={makeSSEExchange(ANTHROPIC_SSE, false)} />,
    );
    expect(screen.getByText("live")).toBeInTheDocument();
    const dot = screen.getByTestId("indicator-dot");
    expect(dot).toHaveClass("bg-green");
    expect(dot).toHaveClass("animate-pulse");
  });

  it("shows 'paused' with amber dot when streaming and scrolled away", async () => {
    await renderAndSettle(
      <ChatStreamView exchange={makeSSEExchange(ANTHROPIC_SSE, false)} />,
    );
    const scrollEl = screen.getByTestId("stream-scroll");
    simulateScrollAway(scrollEl);
    expect(screen.getByText("paused")).toBeInTheDocument();
    const dot = screen.getByTestId("indicator-dot");
    expect(dot).toHaveClass("bg-amber");
    expect(dot).not.toHaveClass("animate-pulse");
  });
});

describe("ChatStreamView — error/disconnected state", () => {
  const RESPONSE_ERROR: Exchange["error"] = {
    direction: "Response",
    message: "connection reset by peer",
  };

  it("shows 'disconnected' with red dot when exchange has Response error", async () => {
    await renderAndSettle(
      <ChatStreamView
        exchange={makeSSEExchange(ANTHROPIC_SSE, false, RESPONSE_ERROR)}
      />,
    );
    expect(screen.getByText("disconnected")).toBeInTheDocument();
    const dot = screen.getByTestId("indicator-dot");
    expect(dot).toHaveClass("bg-red");
    expect(dot).not.toHaveClass("animate-pulse");
  });

  it("hides 'Jump to latest' button when disconnected", async () => {
    await renderAndSettle(
      <ChatStreamView
        exchange={makeSSEExchange(ANTHROPIC_SSE, false, RESPONSE_ERROR)}
      />,
    );
    const scrollEl = screen.getByTestId("stream-scroll");
    simulateScrollAway(scrollEl);
    expect(screen.queryByText("Jump to latest")).not.toBeInTheDocument();
  });

  it("stops transcript pulsing cursor when disconnected", async () => {
    // Incomplete Anthropic stream (no message_stop) — transcript.isComplete
    // is false, so the cursor would normally pulse. Error should suppress it.
    const INCOMPLETE_SSE = [
      'event: message_start\ndata: {"type":"message_start","message":{"id":"msg_01","model":"claude-3-5-sonnet-20241022"}}\n\n',
      'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hello!"}}\n\n',
    ].join("");
    const { container } = await renderAndSettle(
      <ChatStreamView
        exchange={makeSSEExchange(INCOMPLETE_SSE, false, RESPONSE_ERROR)}
      />,
    );
    // Switch to transcript mode
    fireEvent.click(screen.getByText("transcript"));
    // The pulsing cursor span should not be present
    const cursor = container.querySelector("span.animate-pulse.bg-accent");
    expect(cursor).toBeNull();
  });
});
