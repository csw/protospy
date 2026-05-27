import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { ContextBar } from "@ui/components/ContextBar";
import type { Exchange } from "@ui/state/reducer";
import { useStore } from "@ui/state/store";

// Test the error-display rules added in PRO-220: the context bar should
// surface the proxy-level error message inline whenever exchange.error is
// set, regardless of whether a status was also seen.

function makeExchange(overrides: Partial<Exchange> = {}): Exchange {
  return {
    id: 1,
    timestamp: "2024-01-01T00:00:00Z",
    method: "GET",
    uri: "/api/x",
    ...overrides,
  };
}

describe("ContextBar — error display", () => {
  beforeEach(() => {
    useStore.setState(useStore.getInitialState(), true);
  });

  it("shows 'Network error' label with the message when status is absent", () => {
    const ex = makeExchange({
      error: { direction: "Request", message: "connection refused" },
    });
    render(<ContextBar exchange={ex} ordered={[ex]} currentIdx={0} />);

    const display = screen.getByTestId("error-display");
    expect(display).toHaveTextContent("Network error");
    expect(display).toHaveTextContent("connection refused");
    expect(display).toHaveAttribute("title", "connection refused");
    // 'pending' is suppressed when an error is present.
    expect(screen.queryByText("pending")).not.toBeInTheDocument();
  });

  it("shows status and an 'Interrupted' label when both status and error are set", () => {
    const ex = makeExchange({
      status: "200 OK",
      error: { direction: "Response", message: "connection reset" },
    });
    render(<ContextBar exchange={ex} ordered={[ex]} currentIdx={0} />);

    expect(screen.getByText("200 OK")).toBeInTheDocument();
    const display = screen.getByTestId("error-display");
    expect(display).toHaveTextContent("Interrupted");
    expect(display).toHaveTextContent("connection reset");
    // The old asymmetric gate would have hidden the error here.
    expect(display).toBeVisible();
  });

  it("shows 'pending' when there is neither a status nor an error", () => {
    const ex = makeExchange();
    render(<ContextBar exchange={ex} ordered={[ex]} currentIdx={0} />);

    expect(screen.getByText("pending")).toBeInTheDocument();
    expect(screen.queryByTestId("error-display")).not.toBeInTheDocument();
  });
});
