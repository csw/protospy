import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { render } from "@ui/test/render";
import { BodySplit } from "@ui/components/body-split";
import type { Exchange } from "@ui/state/reducer";
import { createSSEStreamState, feedChunk } from "@ui/body/sse-stream";

function makeSSEExchange(): Exchange {
  const sseText =
    'event: message_start\ndata: {"type":"message_start","message":{"id":"msg_01","model":"claude-3-5-sonnet-20241022"}}\n\n';
  return {
    id: 1,
    timestamp: "2024-01-01T00:00:00Z",
    method: "POST",
    uri: "/v1/messages",
    responseBody: {
      chunks: [],
      atEnd: true,
      wireBytes: sseText.length,
      contentType: "text/event-stream",
      sseState: feedChunk(createSSEStreamState(), sseText),
    },
  };
}

function makeJsonExchange(): Exchange {
  return {
    id: 2,
    timestamp: "2024-01-01T00:00:00Z",
    method: "GET",
    uri: "/api",
    responseBody: {
      chunks: [{ text: '{"ok":true}' }],
      atEnd: true,
      wireBytes: 11,
      contentType: "application/json",
    },
  };
}

describe("BodySplit protocol routing", () => {
  it("renders generic StreamView (no mode toggle) for SSE with null protocol", () => {
    render(<BodySplit exchange={makeSSEExchange()} protocol={null} />);
    expect(screen.queryByText("transcript")).not.toBeInTheDocument();
  });

  it("renders ChatStreamView (with mode toggle) for SSE with Anthropic protocol", () => {
    render(<BodySplit exchange={makeSSEExchange()} protocol="Anthropic" />);
    expect(screen.getByText("transcript")).toBeInTheDocument();
    expect(screen.getByText("events")).toBeInTheDocument();
  });

  it("renders BodyPane (no stream header) for non-SSE with null protocol", () => {
    render(<BodySplit exchange={makeJsonExchange()} protocol={null} />);
    expect(screen.queryByText(/\d+ events/)).not.toBeInTheDocument();
  });

  it("renders BodyPane for non-SSE with Anthropic protocol", () => {
    render(<BodySplit exchange={makeJsonExchange()} protocol="Anthropic" />);
    expect(screen.queryByText("transcript")).not.toBeInTheDocument();
  });
});
