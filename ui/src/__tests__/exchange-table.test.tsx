import { describe, it, expect, vi } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { render } from "@ui/test/render";
import { ExchangeTable } from "@ui/components/protospy/exchange-table";
import type { BodyState, Exchange } from "@ui/state/reducer";

function body(partial: Partial<BodyState>): BodyState {
  return { chunks: [], atEnd: true, wireBytes: 0, ...partial };
}

function makeExchange(overrides: Partial<Exchange> = {}): Exchange {
  return {
    id: 1,
    timestamp: "2026-06-08T12:00:00.000Z",
    method: "GET",
    uri: "/api/users?page=2",
    status: "200 OK",
    elapsedMs: 12,
    requestBody: body({ wireBytes: 120 }),
    responseBody: body({ wireBytes: 2048 }),
    ...overrides,
  };
}

describe("ExchangeTable", () => {
  it("renders the six column headers in order", () => {
    render(<ExchangeTable exchanges={[makeExchange()]} selectedId={null} />);
    const header = screen.getByTestId("exchange-table-header");
    const labels = Array.from(header.querySelectorAll("button")).map((b) =>
      b.textContent?.trim(),
    );
    expect(labels).toEqual([
      "Method",
      "Status",
      "Path",
      "Elapsed",
      "Size",
      "Time",
    ]);
  });

  it("renders table-mode status as the numeric code only", () => {
    render(
      <ExchangeTable
        exchanges={[makeExchange({ status: "404 Not Found" })]}
        selectedId={null}
      />,
    );
    expect(screen.getByText("404")).toBeInTheDocument();
    expect(screen.queryByText("404 Not Found")).not.toBeInTheDocument();
  });

  it("renders only the path (no query) and an absolute UTC time", () => {
    render(
      <ExchangeTable exchanges={[makeExchange()]} selectedId={null} tz="utc" />,
    );
    expect(screen.getByText("/api/users")).toBeInTheDocument();
    expect(screen.getByText("12:00:00.000")).toBeInTheDocument();
  });

  it("renders the response wire size with a compression marker icon + tooltip", () => {
    const { container } = render(
      <ExchangeTable
        exchanges={[
          makeExchange({
            responseBody: body({
              wireBytes: 1024,
              decodedBytes: 4096,
              contentEncoding: "gzip",
            }),
          }),
        ]}
        selectedId={null}
      />,
    );
    expect(screen.getByText("1.0 KB")).toBeInTheDocument();
    // Compression marker is an icon; the wire/decoded breakdown is in the title.
    const sizeCell = container.querySelector('[title*="gzip"]');
    expect(sizeCell).not.toBeNull();
    expect(sizeCell).toHaveAttribute(
      "title",
      "1.0KB on the wire / 4.0KB after decompression (gzip)",
    );
    expect(sizeCell?.querySelector("svg")).not.toBeNull();
  });

  it("renders an em dash for the size when there is no response body", () => {
    render(
      <ExchangeTable
        exchanges={[
          makeExchange({ status: undefined, responseBody: undefined }),
        ]}
        selectedId={null}
      />,
    );
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("calls onSelect with the exchange id when a row is clicked", () => {
    const onSelect = vi.fn();
    render(
      <ExchangeTable
        exchanges={[makeExchange({ id: 7 })]}
        selectedId={null}
        onSelect={onSelect}
      />,
    );
    fireEvent.click(screen.getByRole("option"));
    expect(onSelect).toHaveBeenCalledWith(7);
  });

  it("reserves a trace-rail gutter when any exchange carries a trace", () => {
    const { container } = render(
      <ExchangeTable
        exchanges={[makeExchange({ traceId: "abcd1234" })]}
        selectedId={null}
      />,
    );
    expect(container.querySelector("[aria-hidden]")).toBeInTheDocument();
    expect(screen.getByRole("option")).toHaveAttribute("data-trace");
  });

  it("does not reserve a trace gutter when no exchange has a trace", () => {
    const { container } = render(
      <ExchangeTable exchanges={[makeExchange()]} selectedId={null} />,
    );
    expect(container.querySelector("[aria-hidden]")).not.toBeInTheDocument();
  });

  it("marks the selected row", () => {
    render(
      <ExchangeTable exchanges={[makeExchange({ id: 3 })]} selectedId={3} />,
    );
    expect(screen.getByRole("option")).toHaveAttribute("aria-selected", "true");
  });
});
