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

  it("does not render any (encoding) label when no body is compressed", () => {
    render(
      <TimingView
        exchange={makeExchange({
          responseBody: { chunks: [], atEnd: true, wireBytes: 256 },
        })}
      />,
    );
    // No "(...)" parenthesised text should appear for an uncompressed body.
    expect(screen.queryByText(/^\(.+\)$/)).not.toBeInTheDocument();
  });

  it("renders only wire size with (encoding) when decodedBytes is not yet cached", () => {
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
    expect(screen.getByText("256B")).toBeInTheDocument();
    expect(screen.getByText("(gzip)")).toBeInTheDocument();
    // No dual size (no `X / Y` pattern) when decodedBytes is absent.
    expect(screen.queryByText(/\d+B\s*\/\s*\d+B/)).not.toBeInTheDocument();
  });

  it("renders dual wire/decoded size with (encoding) when decodedBytes is cached", () => {
    render(
      <TimingView
        exchange={makeExchange({
          responseBody: {
            chunks: [],
            atEnd: true,
            wireBytes: 1024,
            decodedBytes: 6144,
            contentEncoding: "gzip",
          },
        })}
      />,
    );
    expect(screen.getByText("1.0KB / 6.0KB")).toBeInTheDocument();
    expect(screen.getByText("(gzip)")).toBeInTheDocument();
  });

  it("renders separate encoding labels for compressed request and response", () => {
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
    expect(screen.getByText("(deflate)")).toBeInTheDocument();
    expect(screen.getByText("(br)")).toBeInTheDocument();
  });
});
