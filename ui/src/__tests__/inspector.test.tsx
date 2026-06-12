import { describe, it, expect, vi } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { render } from "@ui/test/render";
import { Inspector } from "@ui/components/inspector";
import type { Exchange } from "@ui/state/reducer";

function makeExchange(overrides: Partial<Exchange> = {}): Exchange {
  return {
    id: 1,
    timestamp: "2024-01-01T12:00:00.000Z",
    method: "GET",
    uri: "/api/users?q=1",
    version: "HTTP/1.1",
    status: "200 OK",
    elapsedMs: 42,
    requestHeaders: [
      { name: "Accept", value: "application/json" },
      { name: "X-Request-Id", value: "abc" },
    ],
    responseHeaders: [{ name: "Content-Type", value: "application/json" }],
    ...overrides,
  };
}

const body = () => <div data-testid="body-split">body</div>;

// Radix Tabs activates on mousedown (left button), not a bare click — fireEvent.click
// doesn't focus the trigger in jsdom, so the panel wouldn't switch.
function selectTab(name: string) {
  fireEvent.mouseDown(screen.getByRole("tab", { name }));
}

describe("Inspector shell — tab strip", () => {
  it("renders the single Bodies · Headers · Timing tab strip", () => {
    render(<Inspector exchange={makeExchange()} renderBodySplit={body} />);
    expect(screen.getByRole("tab", { name: "Bodies" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Headers" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Timing" })).toBeInTheDocument();
    // No separate "Pairs" tab (kept deviation §1)
    expect(
      screen.queryByRole("tab", { name: "Pairs" }),
    ).not.toBeInTheDocument();
  });

  it("labels the first tab 'Stream' for an SSE exchange", () => {
    const sse = makeExchange({
      responseBody: {
        chunks: [],
        atEnd: true,
        wireBytes: 0,
        contentType: "text/event-stream",
      },
    });
    render(<Inspector exchange={sse} renderBodySplit={body} />);
    expect(screen.getByRole("tab", { name: "Stream" })).toBeInTheDocument();
    expect(
      screen.queryByRole("tab", { name: "Bodies" }),
    ).not.toBeInTheDocument();
  });

  it("renders the body-split slot in the Bodies tab", () => {
    render(<Inspector exchange={makeExchange()} renderBodySplit={body} />);
    expect(screen.getByTestId("body-split")).toBeInTheDocument();
  });
});

describe("Inspector shell — context bar", () => {
  it("renders the numeric status code", () => {
    render(<Inspector exchange={makeExchange()} renderBodySplit={body} />);
    expect(screen.getByTestId("status-code")).toHaveTextContent("200");
  });

  it("renders the transport error as 'Error', not the kind discriminant", () => {
    const errored = makeExchange({
      status: undefined,
      error: {
        kind: "generic",
        direction: "Response",
        message: "connection reset by peer",
      },
    });
    render(<Inspector exchange={errored} renderBodySplit={body} />);
    const status = screen.getByTestId("status-code");
    expect(status).toHaveAttribute("data-error");
    expect(status).toHaveTextContent("Error");
    expect(screen.queryByText("generic")).not.toBeInTheDocument();
  });

  it("invokes the nav callbacks", () => {
    const onPrev = vi.fn();
    const onNext = vi.fn();
    const onNextMatching = vi.fn();
    render(
      <Inspector
        exchange={makeExchange()}
        renderBodySplit={body}
        onPrev={onPrev}
        onNext={onNext}
        onNextMatching={onNextMatching}
      />,
    );
    fireEvent.click(screen.getByLabelText("Previous request"));
    fireEvent.click(screen.getByLabelText("Next request"));
    fireEvent.click(
      screen.getByLabelText("Next request with same method + path"),
    );
    expect(onPrev).toHaveBeenCalledOnce();
    expect(onNext).toHaveBeenCalledOnce();
    expect(onNextMatching).toHaveBeenCalledOnce();
  });

  it("wraps path+query as a single truncation unit with a tooltip for the full URI", () => {
    // Both path and query must be inside one truncating element so they don't
    // truncate independently, and the tooltip must expose the full raw URI.
    render(
      <Inspector
        exchange={makeExchange({ uri: "/api/users" })}
        renderBodySplit={body}
      />,
    );
    // Radix adds data-state to the TooltipTrigger child when content is truthy
    expect(screen.getByText("/api/users")).toHaveAttribute("data-state");
  });

  it("keeps the full query string when the URI contains a second '?'", () => {
    // splitUri keeps everything after the FIRST "?"; a raw uri.split("?") would
    // drop the "?cd" tail of the value here.
    render(
      <Inspector
        exchange={makeExchange({ uri: "/search?token=ab?cd" })}
        renderBodySplit={body}
      />,
    );
    expect(screen.getByText("ab?cd")).toBeInTheDocument();
  });

  it("wires the trace pill actions", () => {
    const onFilterTrace = vi.fn();
    const onCopyTrace = vi.fn();
    const onNextInTrace = vi.fn();
    const traceId = "abcdef0123456789abcdef0123456789";
    render(
      <Inspector
        exchange={makeExchange({ traceId })}
        renderBodySplit={body}
        onFilterTrace={onFilterTrace}
        onCopyTrace={onCopyTrace}
        onNextInTrace={onNextInTrace}
      />,
    );
    fireEvent.click(screen.getByLabelText("Copy trace id"));
    fireEvent.click(screen.getByLabelText("Next in trace"));
    expect(onCopyTrace).toHaveBeenCalledWith(traceId);
    expect(onNextInTrace).toHaveBeenCalledWith(traceId);
  });

  it("omits the next-in-trace action when there is no next target", () => {
    render(
      <Inspector
        exchange={makeExchange({ traceId: "abcdef0123456789abcdef0123456789" })}
        renderBodySplit={body}
        onFilterTrace={vi.fn()}
        onCopyTrace={vi.fn()}
        // onNextInTrace omitted — no forward trace member to jump to.
      />,
    );
    expect(screen.getByLabelText("Copy trace id")).toBeInTheDocument();
    expect(screen.queryByLabelText("Next in trace")).not.toBeInTheDocument();
  });
});

describe("Inspector shell — Headers tab", () => {
  it("shows request + response counts in the pane subheads", () => {
    render(<Inspector exchange={makeExchange()} renderBodySplit={body} />);
    selectTab("Headers");
    expect(screen.getByText("Request")).toBeInTheDocument();
    expect(screen.getByText("Response")).toBeInTheDocument();
    expect(screen.getByText("2 headers")).toBeInTheDocument();
    expect(screen.getByText("1 header")).toBeInTheDocument();
  });
});

describe("Inspector shell — Timing tab", () => {
  it("renders honest facts and the live status", () => {
    render(<Inspector exchange={makeExchange()} renderBodySplit={body} />);
    selectTab("Timing");
    expect(screen.getByText("HTTP version")).toBeInTheDocument();
    expect(screen.getByText("Request bytes")).toBeInTheDocument();
    expect(screen.getByText("Response bytes")).toBeInTheDocument();
    // No synthetic waterfall (hard rule 14)
    expect(screen.queryByText("Waterfall")).not.toBeInTheDocument();
    expect(screen.queryByText("Upstream")).not.toBeInTheDocument();
  });

  it("renders a dual wire / decoded size for a compressed body", () => {
    const compressed = makeExchange({
      responseBody: {
        chunks: [],
        atEnd: true,
        wireBytes: 1024,
        decodedBytes: 4096,
        contentEncoding: "gzip",
        contentType: "application/json",
      },
    });
    render(<Inspector exchange={compressed} renderBodySplit={body} />);
    selectTab("Timing");
    expect(screen.getByText("1.0 KB / 4.0 KB")).toBeInTheDocument();
    expect(screen.getByText("(gzip)")).toBeInTheDocument();
  });

  it("shows a lifecycle 'awaiting' label (not 'pending') in the Status fact for an in-flight exchange", () => {
    const inflight = makeExchange({ status: undefined, elapsedMs: undefined });
    render(<Inspector exchange={inflight} renderBodySplit={body} />);
    selectTab("Timing");
    // The Status fact is the cell next to the "Status" label.
    const statusCell = screen.getByText("Status").nextElementSibling;
    expect(statusCell).toHaveTextContent("awaiting");
    expect(statusCell).not.toHaveTextContent("pending");
  });

  it("renders the error message (not the kind) in the Status fact", () => {
    const errored = makeExchange({
      status: undefined,
      error: {
        kind: "generic",
        direction: "Response",
        message: "connection reset by peer",
      },
    });
    render(<Inspector exchange={errored} renderBodySplit={body} />);
    selectTab("Timing");
    expect(screen.getByText("connection reset by peer")).toBeInTheDocument();
    expect(screen.queryByText("generic")).not.toBeInTheDocument();
  });
});

describe("Inspector shell — credential reveal across navigation", () => {
  it("re-masks a revealed Authorization header when the exchange changes", () => {
    const exA = makeExchange({
      id: 1,
      requestHeaders: [{ name: "authorization", value: "Bearer secretA" }],
    });
    const exB = makeExchange({
      id: 2,
      requestHeaders: [{ name: "authorization", value: "Bearer secretB" }],
    });
    const { rerender } = render(
      <Inspector exchange={exA} renderBodySplit={body} />,
    );
    selectTab("Headers");
    // Reveal A's credential.
    fireEvent.click(screen.getByLabelText("Reveal value"));
    expect(screen.getByText("Bearer secretA")).toBeInTheDocument();
    // Navigate to B (same row position): the reveal state must NOT carry over,
    // or B's credential would render in cleartext without any user gesture.
    rerender(<Inspector exchange={exB} renderBodySplit={body} />);
    expect(screen.queryByText("Bearer secretB")).not.toBeInTheDocument();
    expect(screen.getByText("Bearer **********")).toBeInTheDocument();
    // Masked again → the control offers to reveal, not hide.
    expect(screen.getByLabelText("Reveal value")).toBeInTheDocument();
  });
});

describe("Inspector shell — msearch toggle", () => {
  it("does not render the toggle when not an msearch exchange", () => {
    render(<Inspector exchange={makeExchange()} renderBodySplit={body} />);
    expect(screen.queryByText("Raw NDJSON")).not.toBeInTheDocument();
    expect(screen.getByTestId("body-split")).toBeInTheDocument();
  });

  it("renders the Paired ↔ Raw NDJSON toggle and switches views", () => {
    render(
      <Inspector
        exchange={makeExchange()}
        isMsearch
        renderBodySplit={body}
        renderMsearch={(view) => <div data-testid="ms">{view}</div>}
      />,
    );
    // Default Paired view; the body-split slot is not used for msearch
    expect(screen.getByTestId("ms")).toHaveTextContent("paired");
    expect(screen.queryByTestId("body-split")).not.toBeInTheDocument();
    // Toggle to Raw NDJSON
    fireEvent.click(screen.getByText("Raw NDJSON"));
    expect(screen.getByTestId("ms")).toHaveTextContent("raw");
  });
});
