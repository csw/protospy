import { describe, it, expect, beforeEach } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { render } from "@ui/test/render";
import { ExchangeList } from "@ui/components/ExchangeList";
import { useStore } from "@ui/state/store";
import type { Exchange } from "@ui/state/reducer";

function makeExchange(overrides: Partial<Exchange> = {}): Exchange {
  return {
    id: 1,
    timestamp: "2026-06-08T12:00:00.000Z",
    method: "GET",
    uri: "/api/users",
    status: "200 OK",
    elapsedMs: 12,
    ...overrides,
  };
}

/** Seed the store's exchanges/ids from a list, in insertion (id) order. */
function seed(exchanges: Exchange[]) {
  const map = new Map<number, Exchange>();
  for (const ex of exchanges) map.set(ex.id, ex);
  useStore.setState({ exchanges: map, ids: exchanges.map((e) => e.id) });
}

describe("ExchangeList — grouped-by-trace mode", () => {
  beforeEach(() => {
    useStore.setState(useStore.getInitialState(), true);
    localStorage.clear();
    document.documentElement.removeAttribute("data-density");
    // Grouped mode is the surface under test; keep it independent of list mode.
    useStore.setState({
      traceGroupOn: true,
      listMode: "rows",
      order: "oldest",
    });
  });

  it("renders a TraceGroup card for a multi-member trace with count and singleton flat", () => {
    seed([
      makeExchange({
        id: 1,
        uri: "/a",
        traceId: "trace-aaaa-bbbb",
        elapsedMs: 10,
      }),
      makeExchange({
        id: 2,
        uri: "/b",
        traceId: "trace-aaaa-bbbb",
        elapsedMs: 20,
      }),
      makeExchange({ id: 3, uri: "/solo" }), // singleton, no trace
    ]);
    render(<ExchangeList />);

    // Group header: shows request count for the multi-member trace, once —
    // the redundant "N in trace" label was dropped.
    expect(screen.getByText(/2 requests/)).toBeInTheDocument();
    expect(screen.queryByText(/in trace/i)).not.toBeInTheDocument();
    // Both grouped members render inside the (default-open) card.
    expect(screen.getByText("/a")).toBeInTheDocument();
    expect(screen.getByText("/b")).toBeInTheDocument();
    // The singleton stays flat (still rendered).
    expect(screen.getByText("/solo")).toBeInTheDocument();
  });

  it("collapses and expands a trace card via its toggle", () => {
    seed([
      makeExchange({ id: 1, uri: "/a", traceId: "t1" }),
      makeExchange({ id: 2, uri: "/b", traceId: "t1" }),
    ]);
    render(<ExchangeList />);

    expect(screen.getByText("/a")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /collapse trace/i }));
    expect(screen.queryByText("/a")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /expand trace/i }));
    expect(screen.getByText("/a")).toBeInTheDocument();
  });

  it("takes precedence over table mode and shows the empty state when nothing is visible", () => {
    useStore.setState({ listMode: "table" });
    seed([]);
    render(<ExchangeList />);

    // No table header is rendered — grouped mode owns the content area.
    expect(
      screen.queryByTestId("exchange-table-header"),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/no requests/i)).toBeInTheDocument();
  });

  it("clicking the trace label filters to that trace", () => {
    seed([
      makeExchange({ id: 1, uri: "/a", traceId: "t1" }),
      makeExchange({ id: 2, uri: "/b", traceId: "t1" }),
    ]);
    render(<ExchangeList />);

    fireEvent.click(screen.getByRole("button", { name: /filter to trace/i }));
    expect(useStore.getState().traceFilter).toBe("t1");
  });
});
