import { describe, it, expect, vi } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { render } from "@ui/test/render";
import { ExchangeRow } from "@ui/components/protospy/exchange-row";
import type { BodyState, Exchange } from "@ui/state/reducer";

function body(partial: Partial<BodyState>): BodyState {
  return { chunks: [], atEnd: true, wireBytes: 0, ...partial };
}

function makeExchange(overrides: Partial<Exchange> = {}): Exchange {
  return {
    id: 1,
    timestamp: "2026-06-08T12:00:00.000Z",
    method: "GET",
    uri: "/api/users",
    status: "200 OK",
    elapsedMs: 12,
    requestBody: body({ wireBytes: 120 }),
    responseBody: body({ wireBytes: 2048 }),
    ...overrides,
  };
}

describe("ExchangeRow", () => {
  it("renders the method badge with the canonical --method-* class", () => {
    render(<ExchangeRow exchange={makeExchange({ method: "GET" })} />);
    const badge = screen.getByTestId("method-badge");
    expect(badge).toHaveTextContent("GET");
    expect(badge).toHaveClass("text-method-get");
    expect(badge).toHaveClass("bg-method-get-bg");
  });

  it("falls back to a neutral badge for an unknown method", () => {
    render(<ExchangeRow exchange={makeExchange({ method: "CONNECT" })} />);
    const badge = screen.getByTestId("method-badge");
    expect(badge).toHaveTextContent("CONNECT");
    expect(badge).toHaveClass("text-muted-foreground");
  });

  it("renders the full status line (rows mode) from the live string status", () => {
    render(
      <ExchangeRow exchange={makeExchange({ status: "404 Not Found" })} />,
    );
    expect(screen.getByText("404 Not Found")).toBeInTheDocument();
  });

  it("renders an absolute timestamp honouring the UTC toggle", () => {
    render(<ExchangeRow exchange={makeExchange()} tz="utc" />);
    expect(screen.getByText("12:00:00.000")).toBeInTheDocument();
  });

  it("calls onSelect when clicked", () => {
    const onSelect = vi.fn();
    render(<ExchangeRow exchange={makeExchange()} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("option"));
    expect(onSelect).toHaveBeenCalledOnce();
  });

  it("shows a distinct network-error state: 'Error' + the real message, no status", () => {
    render(
      <ExchangeRow
        exchange={makeExchange({
          status: undefined,
          responseBody: undefined,
          error: {
            kind: "generic",
            direction: "Response",
            message: "connection reset by peer",
          },
        })}
      />,
    );
    expect(screen.getByText("Error")).toBeInTheDocument();
    expect(screen.getByText("connection reset by peer")).toBeInTheDocument();
    expect(screen.getByRole("option")).toHaveAttribute("data-error", "true");
  });

  it("shows a mid-stream error as '500 ✕' — the arrived status plus an error mark", () => {
    render(
      <ExchangeRow
        exchange={makeExchange({
          status: "500 Internal Server Error",
          error: {
            kind: "generic",
            direction: "Response",
            message: "stream broke",
          },
        })}
      />,
    );
    expect(screen.getByText("500 ✕")).toBeInTheDocument();
  });

  it("renders an SSE badge when the response is an event stream", () => {
    render(
      <ExchangeRow
        exchange={makeExchange({
          responseBody: body({ contentType: "text/event-stream" }),
        })}
      />,
    );
    expect(screen.getByText("SSE")).toBeInTheDocument();
  });

  it("renders an msearch badge for a bulk-operation URI", () => {
    render(<ExchangeRow exchange={makeExchange({ uri: "/idx/_msearch" })} />);
    expect(screen.getByText("msearch")).toBeInTheDocument();
  });

  it("binds a data-trace attribute when the exchange carries a traceId", () => {
    render(<ExchangeRow exchange={makeExchange({ traceId: "abcd1234" })} />);
    const trace = screen.getByRole("option").getAttribute("data-trace");
    expect(trace).toMatch(/^[1-7]$/);
  });

  it("omits data-trace when there is no traceId", () => {
    render(<ExchangeRow exchange={makeExchange({ traceId: undefined })} />);
    expect(screen.getByRole("option")).not.toHaveAttribute("data-trace");
  });

  it("renders an em dash for the response size when there is no response body", () => {
    render(
      <ExchangeRow
        exchange={makeExchange({ status: undefined, responseBody: undefined })}
      />,
    );
    expect(screen.getByText("res —")).toBeInTheDocument();
  });

  it("marks the selected row via aria-selected and data-selected", () => {
    render(<ExchangeRow exchange={makeExchange()} selected />);
    const row = screen.getByRole("option");
    expect(row).toHaveAttribute("aria-selected", "true");
    expect(row).toHaveAttribute("data-selected", "true");
  });
});
