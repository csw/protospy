import { describe, it, expect, afterEach } from "vitest";
import { screen, fireEvent, act } from "@testing-library/react";
import { render } from "@ui/test/render";
import { StreamView } from "@ui/components/stream-view";
import { ChatStreamView } from "@ui/components/anthropic/chat-stream-view";
import { BodySplit } from "@ui/components/body-split";
import type { Exchange } from "@ui/state/reducer";
import { createSSEStreamState, feedChunk } from "@ui/body/sse-stream";

function makeSSEExchange(
  sseText: string,
  atEnd = true,
  error?: Exchange["error"],
  id = 1,
): Exchange {
  let sseState = createSSEStreamState();
  if (sseText) {
    sseState = feedChunk(sseState, sseText);
  }
  return {
    id,
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
 * Drain a real macrotask inside act() so EventLog's virtualizer settles its
 * visible range AND any notify it scheduled fires now, not after vitest tears
 * the jsdom window down at end-of-file (react-virtual's deferred setState would
 * otherwise throw `window is not defined`). Runs before the setup.ts cleanup
 * (afterEach is LIFO), so the timer fires while the tree is still mounted.
 */
function flush() {
  return act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}
afterEach(flush);

async function renderAndSettle(ui: React.ReactElement) {
  const result = render(ui);
  await flush();
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
  it("renders events through the scaffold presentation", async () => {
    await renderAndSettle(
      <StreamView exchange={makeSSEExchange(GENERIC_SSE)} />,
    );
    expect(screen.getByText("ping")).toBeInTheDocument();
    expect(screen.getByText("message")).toBeInTheDocument();
  });

  it("renders event-type labels as plain semantic-token text, not pills", async () => {
    await renderAndSettle(
      <StreamView exchange={makeSSEExchange(GENERIC_SSE)} />,
    );
    const ping = screen.getByText("ping");
    expect(ping).toHaveClass("text-muted-foreground/70");
    expect(ping).not.toHaveClass("bg-secondary"); // legacy pill gone
    expect(screen.getByText("message")).toHaveClass(
      "text-secondary-foreground",
    );
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

  it("exposes an aria-live status region for assistive tech", async () => {
    await renderAndSettle(
      <StreamView exchange={makeSSEExchange(GENERIC_SSE)} />,
    );
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
  });
});

describe("StreamView — live indicator states", () => {
  it("shows 'complete' when the stream has ended", async () => {
    await renderAndSettle(
      <StreamView exchange={makeSSEExchange(GENERIC_SSE, true)} />,
    );
    expect(screen.getByText("complete")).toHaveClass("text-muted-foreground");
  });

  it("shows 'live' when streaming and following", async () => {
    await renderAndSettle(
      <StreamView exchange={makeSSEExchange(GENERIC_SSE, false)} />,
    );
    expect(screen.getByText("live")).toHaveClass("text-conn-open");
  });

  it("shows 'paused' when streaming and scrolled away", async () => {
    await renderAndSettle(
      <StreamView exchange={makeSSEExchange(GENERIC_SSE, false)} />,
    );
    simulateScrollAway(screen.getByTestId("stream-scroll"));
    expect(screen.getByText("paused")).toHaveClass("text-conn-connecting");
  });
});

describe("StreamView — 'Jump to latest' pill", () => {
  it("shows when streaming and scrolled away", async () => {
    await renderAndSettle(
      <StreamView exchange={makeSSEExchange(GENERIC_SSE, false)} />,
    );
    simulateScrollAway(screen.getByTestId("stream-scroll"));
    expect(screen.getByText("Jump to latest")).toBeInTheDocument();
  });

  it("does not show when following", async () => {
    await renderAndSettle(
      <StreamView exchange={makeSSEExchange(GENERIC_SSE, false)} />,
    );
    expect(screen.queryByText("Jump to latest")).not.toBeInTheDocument();
  });

  it("does not show when the stream has ended", async () => {
    await renderAndSettle(
      <StreamView exchange={makeSSEExchange(GENERIC_SSE, true)} />,
    );
    simulateScrollAway(screen.getByTestId("stream-scroll"));
    expect(screen.queryByText("Jump to latest")).not.toBeInTheDocument();
  });
});

describe("StreamView — play/pause", () => {
  it("offers a pause control while the stream is live", async () => {
    await renderAndSettle(
      <StreamView exchange={makeSSEExchange(GENERIC_SSE, false)} />,
    );
    expect(screen.getByLabelText("Pause stream")).toBeInTheDocument();
  });

  it("hides the transport control once the stream is complete", async () => {
    await renderAndSettle(
      <StreamView exchange={makeSSEExchange(GENERIC_SSE, true)} />,
    );
    expect(screen.queryByLabelText("Pause stream")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Resume stream")).not.toBeInTheDocument();
  });

  it("freezes the event list while paused and resumes on play", async () => {
    const before = makeSSEExchange(GENERIC_SSE, false); // ping, message
    const { rerender } = await renderAndSettle(
      <StreamView exchange={before} />,
    );

    fireEvent.click(screen.getByLabelText("Pause stream"));
    expect(screen.getByText("paused")).toBeInTheDocument();

    // More events arrive while paused — the frozen snapshot must not grow.
    const after = makeSSEExchange(
      GENERIC_SSE + "event: update\ndata: more\n\n",
      false,
    );
    rerender(<StreamView exchange={after} />);
    await flush();
    expect(screen.queryByText("update")).not.toBeInTheDocument();

    // Resuming drops the snapshot and shows the live list again.
    fireEvent.click(screen.getByLabelText("Resume stream"));
    rerender(<StreamView exchange={after} />);
    await flush();
    expect(screen.getByText("update")).toBeInTheDocument();
  });
});

describe("StreamView — error/disconnected state", () => {
  const RESPONSE_ERROR: Exchange["error"] = {
    direction: "Response",
    message: "connection reset by peer",
  };

  it("shows 'disconnected' on a Response-direction error", async () => {
    await renderAndSettle(
      <StreamView
        exchange={makeSSEExchange(GENERIC_SSE, false, RESPONSE_ERROR)}
      />,
    );
    expect(screen.getByText("disconnected")).toHaveClass("text-conn-down");
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

  it("renders the error banner when the exchange has an error", async () => {
    await renderAndSettle(
      <StreamView
        exchange={makeSSEExchange(GENERIC_SSE, false, RESPONSE_ERROR)}
      />,
    );
    const banner = screen.getByTestId("stream-error-banner");
    expect(banner).toHaveTextContent("connection reset by peer");
  });

  it("renders the error banner even with an empty stream", async () => {
    await renderAndSettle(
      <StreamView exchange={makeSSEExchange("", false, RESPONSE_ERROR)} />,
    );
    expect(screen.getByTestId("stream-error-banner")).toBeInTheDocument();
  });

  it("does not render the error banner when there is no error", async () => {
    await renderAndSettle(
      <StreamView exchange={makeSSEExchange(GENERIC_SSE)} />,
    );
    expect(screen.queryByTestId("stream-error-banner")).not.toBeInTheDocument();
  });

  it("applies wrap-anywhere to banner message text so long errors do not clip (PRO-383)", async () => {
    await renderAndSettle(
      <StreamView
        exchange={makeSSEExchange(GENERIC_SSE, false, RESPONSE_ERROR)}
      />,
    );
    const banner = screen.getByTestId("stream-error-banner");
    const msgEl = banner.querySelector("span");
    expect(msgEl).toHaveClass("wrap-anywhere");
  });
});

describe("StreamView — pause snapshot does not leak across exchanges (key reset)", () => {
  it("a paused stream's frozen events do not bleed onto a different exchange", async () => {
    // BodySplit keys the stream view on exchange.id, so selecting a different
    // exchange remounts it and clears the play/pause snapshot.
    const a = makeSSEExchange(GENERIC_SSE, false, undefined, 1); // ping, message
    const { rerender } = render(<BodySplit exchange={a} protocol={null} />);
    await flush();

    fireEvent.click(screen.getByLabelText("Pause stream"));
    expect(screen.getByText("paused")).toBeInTheDocument();

    const b = makeSSEExchange("event: other\ndata: x\n\n", false, undefined, 2);
    rerender(<BodySplit exchange={b} protocol={null} />);
    await flush();

    // The new exchange shows its own live events, not A's frozen snapshot.
    expect(screen.getByText("other")).toBeInTheDocument();
    expect(screen.queryByText("ping")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Pause stream")).toBeInTheDocument(); // live, not paused
  });
});

const ANTHROPIC_SSE = [
  'event: message_start\ndata: {"type":"message_start","message":{"id":"msg_01","model":"claude-3-5-sonnet-20241022"}}\n\n',
  'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hello!"}}\n\n',
  'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"input_tokens":25,"output_tokens":12}}\n\n',
  'event: message_stop\ndata: {"type":"message_stop"}\n\n',
].join("");

describe("ChatStreamView — Anthropic protocol", () => {
  it("renders the transcript/events mode toggle as a single-select ToggleGroup", async () => {
    await renderAndSettle(
      <ChatStreamView exchange={makeSSEExchange(ANTHROPIC_SSE)} />,
    );
    // Controlled value reflects the default mode ("events"); single-select
    // means exactly one item is on. (Radix radio semantics — data-state /
    // aria-checked / single-select — are covered at the primitive level in
    // ToggleGroup.test.tsx; arrow-key roving-tabindex and the focus-visible
    // ring are Radix-native and not separately re-asserted here.)
    expect(screen.getByText("events")).toHaveAttribute("data-state", "on");
    expect(screen.getByText("transcript")).toHaveAttribute("data-state", "off");
  });

  it("switches the rendered view when the mode toggle changes", async () => {
    await renderAndSettle(
      <ChatStreamView exchange={makeSSEExchange(ANTHROPIC_SSE)} />,
    );
    // events mode (default) renders the event-type labels via EventLog.
    expect(screen.getByText("message_start")).toBeInTheDocument();

    // Selecting transcript swaps in the transcript view and the controlled
    // selection follows — the prior segmented control's behavior, preserved.
    fireEvent.click(screen.getByText("transcript"));
    expect(screen.getByText("transcript")).toHaveAttribute("data-state", "on");
    expect(screen.getByText("events")).toHaveAttribute("data-state", "off");
    expect(screen.queryByText("message_start")).not.toBeInTheDocument();
    expect(screen.getByText("Hello!")).toHaveClass("text-mono");
  });

  it("shows event types in events mode (default)", async () => {
    await renderAndSettle(
      <ChatStreamView exchange={makeSSEExchange(ANTHROPIC_SSE)} />,
    );
    expect(screen.getByText("message_start")).toBeInTheDocument();
    expect(screen.queryByText("4 events")).not.toBeInTheDocument();
  });

  it("keeps the model/message header and stop_reason/usage footer in transcript mode", async () => {
    await renderAndSettle(
      <ChatStreamView exchange={makeSSEExchange(ANTHROPIC_SSE)} />,
    );
    fireEvent.click(screen.getByText("transcript"));
    expect(screen.getByText("claude-3-5-sonnet-20241022")).toBeInTheDocument();
    expect(screen.getByText("msg msg_01…")).toBeInTheDocument();
    expect(screen.getByText("stop_reason: end_turn")).toBeInTheDocument();
    expect(screen.getByText("usage: 25 in / 12 out")).toBeInTheDocument();
  });

  it("renders message_start through the shared EventLog presentation", async () => {
    await renderAndSettle(
      <ChatStreamView exchange={makeSSEExchange(ANTHROPIC_SSE)} />,
    );
    const label = screen.getByText("message_start");
    expect(label).toHaveClass("text-redirect"); // lifecycle boundary → amber
    expect(label).not.toHaveClass("text-purple-500"); // legacy pill gone
    expect(label).not.toHaveClass("text-method-patch"); // not a borrowed method color
  });

  it("shows 'No events yet' when body is empty", async () => {
    await renderAndSettle(<ChatStreamView exchange={makeSSEExchange("")} />);
    expect(screen.getByText("No events yet")).toBeInTheDocument();
  });
});

describe("ChatStreamView — live indicator + jump-to-latest", () => {
  it("shows 'complete' with gray dot when the stream has ended", async () => {
    await renderAndSettle(
      <ChatStreamView exchange={makeSSEExchange(ANTHROPIC_SSE, true)} />,
    );
    expect(screen.getByText("complete")).toBeInTheDocument();
    const dot = screen.getByTestId("indicator-dot");
    expect(dot).toHaveClass("bg-muted-foreground");
  });

  it("shows 'live' with a pulsing green dot when streaming and following", async () => {
    await renderAndSettle(
      <ChatStreamView exchange={makeSSEExchange(ANTHROPIC_SSE, false)} />,
    );
    expect(screen.getByText("live")).toBeInTheDocument();
    const dot = screen.getByTestId("indicator-dot");
    expect(dot).toHaveClass("bg-conn-open");
    expect(dot).toHaveClass("motion-safe:animate-pulse");
  });

  it("shows the jump-to-latest pill when streaming and scrolled away", async () => {
    await renderAndSettle(
      <ChatStreamView exchange={makeSSEExchange(ANTHROPIC_SSE, false)} />,
    );
    simulateScrollAway(screen.getByTestId("stream-scroll"));
    expect(screen.getByText("Jump to latest")).toBeInTheDocument();
  });
});

describe("ChatStreamView — error/disconnected state", () => {
  const RESPONSE_ERROR: Exchange["error"] = {
    direction: "Response",
    message: "connection reset by peer",
  };

  it("shows 'disconnected' with a red dot on a Response error", async () => {
    await renderAndSettle(
      <ChatStreamView
        exchange={makeSSEExchange(ANTHROPIC_SSE, false, RESPONSE_ERROR)}
      />,
    );
    expect(screen.getByText("disconnected")).toBeInTheDocument();
    expect(screen.getByTestId("indicator-dot")).toHaveClass("bg-conn-down");
  });

  it("renders the error banner in events mode", async () => {
    await renderAndSettle(
      <ChatStreamView
        exchange={makeSSEExchange(ANTHROPIC_SSE, false, RESPONSE_ERROR)}
      />,
    );
    expect(screen.getByTestId("stream-error-banner")).toHaveTextContent(
      "connection reset by peer",
    );
  });

  it("renders the error banner in transcript mode", async () => {
    await renderAndSettle(
      <ChatStreamView
        exchange={makeSSEExchange(ANTHROPIC_SSE, false, RESPONSE_ERROR)}
      />,
    );
    fireEvent.click(screen.getByText("transcript"));
    expect(screen.getByTestId("stream-error-banner")).toBeInTheDocument();
  });

  it("does not render the error banner when there is no error", async () => {
    await renderAndSettle(
      <ChatStreamView exchange={makeSSEExchange(ANTHROPIC_SSE)} />,
    );
    expect(screen.queryByTestId("stream-error-banner")).not.toBeInTheDocument();
  });
});
