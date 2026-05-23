import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
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
  afterEach(() => {
    cleanup();
  });

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
    expect(btn).toHaveClass("py-1");
    expect(btn).not.toHaveClass("py-1.5");
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
    expect(btn).toHaveClass("py-1.5");
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
});
