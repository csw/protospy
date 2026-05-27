import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ExchangeListItem } from "@ui/components/ExchangeListItem";
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

describe("ExchangeListItem", () => {
  it("renders the method badge with the expected class", () => {
    render(
      <ExchangeListItem
        exchange={makeExchange({ method: "GET" })}
        selected={false}
        onSelect={() => {}}
        density="regular"
      />,
    );
    const badge = screen.getByText("GET");
    expect(badge).toBeInTheDocument();
    expect(badge.tagName).toBe("SPAN");
    expect(badge).toHaveClass("text-m-get");
    expect(badge).toHaveClass("bg-m-get-bg");
  });

  it("renders a different method badge with its method-specific class", () => {
    render(
      <ExchangeListItem
        exchange={makeExchange({ method: "POST" })}
        selected={false}
        onSelect={() => {}}
        density="regular"
      />,
    );
    const badge = screen.getByText("POST");
    expect(badge).toHaveClass("text-m-post");
    expect(badge).toHaveClass("bg-m-post-bg");
  });

  it("renders 2xx status with text-green", () => {
    render(
      <ExchangeListItem
        exchange={makeExchange({ status: "200" })}
        selected={false}
        onSelect={() => {}}
        density="regular"
      />,
    );
    const status = screen.getByText("200");
    expect(status).toHaveClass("text-green");
  });

  it("renders 4xx status with text-red", () => {
    render(
      <ExchangeListItem
        exchange={makeExchange({ status: "404" })}
        selected={false}
        onSelect={() => {}}
        density="regular"
      />,
    );
    const status = screen.getByText("404");
    expect(status).toHaveClass("text-red");
  });

  it("renders 5xx status with text-red", () => {
    render(
      <ExchangeListItem
        exchange={makeExchange({ status: "503" })}
        selected={false}
        onSelect={() => {}}
        density="regular"
      />,
    );
    const status = screen.getByText("503");
    expect(status).toHaveClass("text-red");
  });

  it("renders only path when URI has no query string", () => {
    render(
      <ExchangeListItem
        exchange={makeExchange({ uri: "/foo/bar" })}
        selected={false}
        onSelect={() => {}}
        density="regular"
      />,
    );
    expect(screen.getByText("/foo/bar")).toBeInTheDocument();
    // No element rendering a query string.
    expect(screen.queryByText(/^\?/)).not.toBeInTheDocument();
  });

  it("renders path and query span when URI contains '?'", () => {
    render(
      <ExchangeListItem
        exchange={makeExchange({ uri: "/foo/bar?a=1&b=2" })}
        selected={false}
        onSelect={() => {}}
        density="regular"
      />,
    );
    expect(screen.getByText("/foo/bar")).toBeInTheDocument();
    const query = screen.getByText("?a=1&b=2");
    expect(query).toBeInTheDocument();
    expect(query).toHaveClass("text-dim");
  });

  it("applies aria-selected='true' and the active-background class when selected", () => {
    render(
      <ExchangeListItem
        exchange={makeExchange()}
        selected={true}
        onSelect={() => {}}
        density="regular"
      />,
    );
    const btn = screen.getByRole("option");
    expect(btn).toHaveAttribute("aria-selected", "true");
    expect(btn).toHaveClass("bg-bg-active");
    expect(btn).toHaveClass("border-l-accent");
  });

  it("applies aria-selected='false' when not selected", () => {
    render(
      <ExchangeListItem
        exchange={makeExchange()}
        selected={false}
        onSelect={() => {}}
        density="regular"
      />,
    );
    const btn = screen.getByRole("option");
    expect(btn).toHaveAttribute("aria-selected", "false");
    expect(btn).not.toHaveClass("bg-bg-active");
  });

  it("renders 'ERR' when error is set and status is absent", () => {
    render(
      <ExchangeListItem
        exchange={makeExchange({
          status: undefined,
          error: { direction: "Request", message: "boom" },
        })}
        selected={false}
        onSelect={() => {}}
        density="regular"
      />,
    );
    const err = screen.getByText("ERR");
    expect(err).toBeInTheDocument();
    expect(err).toHaveClass("text-red");
  });

  it("does not render 'ERR' when status is also present", () => {
    render(
      <ExchangeListItem
        exchange={makeExchange({
          status: "500",
          error: { direction: "Response", message: "boom" },
        })}
        selected={false}
        onSelect={() => {}}
        density="regular"
      />,
    );
    expect(screen.queryByText("ERR")).not.toBeInTheDocument();
    expect(screen.getByText("500")).toBeInTheDocument();
  });

  it("uses compact padding class when density is 'compact'", () => {
    render(
      <ExchangeListItem
        exchange={makeExchange()}
        selected={false}
        onSelect={() => {}}
        density="compact"
      />,
    );
    const btn = screen.getByRole("option");
    // compact: py-1.5 (6px vertical), px-[10px] horizontal per design --pad-y/--pad-x compact
    expect(btn).toHaveClass("py-1.5");
    expect(btn).not.toHaveClass("py-2");
  });

  it("uses regular padding class when density is 'regular'", () => {
    render(
      <ExchangeListItem
        exchange={makeExchange()}
        selected={false}
        onSelect={() => {}}
        density="regular"
      />,
    );
    const btn = screen.getByRole("option");
    // regular: py-2 (8px vertical), px-3 (12px horizontal) per design --pad-y/--pad-x
    expect(btn).toHaveClass("py-2");
    expect(btn).not.toHaveClass("py-1.5");
  });

  it("calls onSelect when clicked", () => {
    const onSelect = vi.fn();
    render(
      <ExchangeListItem
        exchange={makeExchange()}
        selected={false}
        onSelect={onSelect}
        density="regular"
      />,
    );
    fireEvent.click(screen.getByRole("option"));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  // Narrow-width layout guard tests (PRO-184)

  it("button has overflow-hidden to prevent row content bleeding into adjacent rows", () => {
    render(
      <ExchangeListItem
        exchange={makeExchange()}
        selected={false}
        onSelect={() => {}}
        density="regular"
      />,
    );
    expect(screen.getByRole("option")).toHaveClass("overflow-hidden");
  });

  it("status code span has shrink-0 to hold its width at narrow pane widths", () => {
    render(
      <ExchangeListItem
        exchange={makeExchange({ status: "404" })}
        selected={false}
        onSelect={() => {}}
        density="regular"
      />,
    );
    expect(screen.getByTestId("status-code")).toHaveClass("shrink-0");
  });

  it("ERR badge has shrink-0 to hold its width at narrow pane widths", () => {
    render(
      <ExchangeListItem
        exchange={makeExchange({
          status: undefined,
          error: { direction: "Request", message: "boom" },
        })}
        selected={false}
        onSelect={() => {}}
        density="regular"
      />,
    );
    expect(screen.getByText("ERR")).toHaveClass("shrink-0");
  });

  it("renders the compression indicator when responseBody has contentEncoding", () => {
    render(
      <ExchangeListItem
        exchange={makeExchange({
          responseBody: {
            chunks: [],
            atEnd: true,
            wireBytes: 28,
            contentEncoding: "gzip",
          },
        })}
        selected={false}
        onSelect={() => {}}
        density="regular"
      />,
    );
    const indicator = screen.getByTestId("compression-indicator");
    expect(indicator).toBeInTheDocument();
    expect(indicator).toHaveAttribute("title", "Compressed: gzip");
  });

  it("does not render a compression indicator when no body is compressed", () => {
    render(
      <ExchangeListItem
        exchange={makeExchange({
          responseBody: { chunks: [], atEnd: true, wireBytes: 28 },
        })}
        selected={false}
        onSelect={() => {}}
        density="regular"
      />,
    );
    expect(
      screen.queryByTestId("compression-indicator"),
    ).not.toBeInTheDocument();
  });

  it("renders separate indicators for compressed request and response bodies", () => {
    render(
      <ExchangeListItem
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
            wireBytes: 100,
            contentEncoding: "br",
          },
        })}
        selected={false}
        onSelect={() => {}}
        density="regular"
      />,
    );
    const indicators = screen.getAllByTestId("compression-indicator");
    expect(indicators).toHaveLength(2);
    expect(indicators[0]).toHaveAttribute("title", "Compressed: deflate");
    expect(indicators[1]).toHaveAttribute("title", "Compressed: br");
  });

  it("metadata row has whitespace-nowrap to prevent text wrapping at narrow widths", () => {
    render(
      <ExchangeListItem
        exchange={makeExchange()}
        selected={false}
        onSelect={() => {}}
        density="regular"
      />,
    );
    // The row-3 container wraps the req/res size spans
    const reqSpan = screen.getByText(/^req /);
    expect(reqSpan.closest("div")).toHaveClass("whitespace-nowrap");
  });
});
