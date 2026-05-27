import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TimingView } from "@ui/components/TimingView";
import type { Exchange } from "@ui/state/reducer";

function makeExchange(overrides: Partial<Exchange> = {}): Exchange {
  return {
    id: 1,
    timestamp: "2024-01-01T00:00:00.000Z",
    method: "GET",
    uri: "/foo",
    status: "200",
    elapsedMs: 12,
    ...overrides,
  };
}

describe("TimingView", () => {
  it("renders request and response sizes from wireBytes", () => {
    render(
      <TimingView
        exchange={makeExchange({
          requestBody: { chunks: [], atEnd: true, wireBytes: 10 },
          responseBody: { chunks: [], atEnd: true, wireBytes: 256 },
        })}
      />,
    );
    expect(screen.getByText("Request size")).toBeInTheDocument();
    expect(screen.getByText("Response size")).toBeInTheDocument();
    expect(screen.getByText("10B")).toBeInTheDocument();
    expect(screen.getByText("256B")).toBeInTheDocument();
  });

  it("does not render a compression indicator when no body is compressed", () => {
    render(
      <TimingView
        exchange={makeExchange({
          responseBody: { chunks: [], atEnd: true, wireBytes: 256 },
        })}
      />,
    );
    expect(
      screen.queryByTestId("compression-indicator"),
    ).not.toBeInTheDocument();
  });

  it("renders a compression indicator and encoding label for a compressed response", () => {
    render(
      <TimingView
        exchange={makeExchange({
          responseBody: {
            chunks: [],
            atEnd: true,
            wireBytes: 256,
            contentEncoding: "gzip",
          },
        })}
      />,
    );
    expect(screen.getByTestId("compression-indicator")).toHaveAttribute(
      "title",
      "Compressed: gzip",
    );
    expect(screen.getByText("(gzip)")).toBeInTheDocument();
  });

  it("renders separate indicators for compressed request and response", () => {
    render(
      <TimingView
        exchange={makeExchange({
          requestBody: {
            chunks: [],
            atEnd: true,
            wireBytes: 10,
            contentEncoding: "deflate",
          },
          responseBody: {
            chunks: [],
            atEnd: true,
            wireBytes: 256,
            contentEncoding: "br",
          },
        })}
      />,
    );
    const indicators = screen.getAllByTestId("compression-indicator");
    expect(indicators).toHaveLength(2);
    expect(indicators[0]).toHaveAttribute("title", "Compressed: deflate");
    expect(indicators[1]).toHaveAttribute("title", "Compressed: br");
    expect(screen.getByText("(deflate)")).toBeInTheDocument();
    expect(screen.getByText("(br)")).toBeInTheDocument();
  });
});
