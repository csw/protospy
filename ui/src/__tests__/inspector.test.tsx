import { describe, it, expect, vi, beforeEach } from "vitest";
import { useState } from "react";
import { screen, fireEvent, act } from "@testing-library/react";
import { render } from "@ui/test/render";
import { Inspector } from "@ui/components/inspector";
import { useStore } from "@ui/state/store";
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
    const ex = makeExchange();
    render(
      <Inspector
        exchange={ex}
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
    // onNextMatching receives the current exchange so the container can read
    // store state at call time rather than closing over a rendered snapshot.
    expect(onNextMatching).toHaveBeenCalledWith(ex);
  });

  it("wraps path+query as a single truncation unit with a tooltip for the full URI", () => {
    // Both path and query must be inside one truncating element so they don't
    // truncate independently, and the tooltip must expose the full raw URI.
    render(
      <Inspector
        exchange={makeExchange({ uri: "/api/users?limit=10" })}
        renderBodySplit={body}
      />,
    );
    // Radix sets data-state="closed" on the TooltipTrigger child at mount.
    // The truncating span contains both path and query as one unit.
    const trigger = screen
      .getByText("limit", { exact: true })
      .closest("span[data-state]");
    expect(trigger).not.toBeNull();
    expect(trigger).toHaveAttribute("data-state", "closed");
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
    const ex = makeExchange({ traceId });
    render(
      <Inspector
        exchange={ex}
        renderBodySplit={body}
        onFilterTrace={onFilterTrace}
        onCopyTrace={onCopyTrace}
        onNextInTrace={onNextInTrace}
      />,
    );
    fireEvent.click(screen.getByLabelText("Copy trace id"));
    fireEvent.click(screen.getByLabelText("Next in trace"));
    expect(onCopyTrace).toHaveBeenCalledWith(traceId);
    // onNextInTrace receives the exchange then the trace id so the container
    // reads store state at call time rather than closing over a rendered snapshot.
    expect(onNextInTrace).toHaveBeenCalledWith(ex, traceId);
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

describe("Inspector shell — memo boundary", () => {
  it("does not re-render when stable props are unchanged", () => {
    // renderBodySplit is called once per Inspector render; use it as a render counter.
    const bodyRender = vi
      .fn()
      .mockReturnValue(<div data-testid="body-split">body</div>);
    const ex = makeExchange();
    const onPrev = vi.fn();
    const onNext = vi.fn();

    // Wrapper that can re-render itself without touching Inspector's props.
    let triggerRerender!: () => void;
    function Wrapper() {
      const [, setN] = useState(0);
      triggerRerender = () => act(() => setN((c) => c + 1));
      return (
        <Inspector
          exchange={ex}
          renderBodySplit={bodyRender}
          onPrev={onPrev}
          onNext={onNext}
        />
      );
    }

    render(<Wrapper />);
    expect(bodyRender).toHaveBeenCalledTimes(1);

    // Re-render the wrapper (simulates an unrelated store update in InspectorPanel);
    // Inspector's props haven't changed so memo should suppress the re-render.
    triggerRerender();
    expect(bodyRender).toHaveBeenCalledTimes(1);
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

describe("Inspector shell — body view-mode selector", () => {
  // bodyViewMode is shared session store state; reset between tests so a mode
  // selected in one case doesn't leak into the next.
  beforeEach(() => {
    useStore.getState().setBodyViewMode("parsed");
  });

  const ms = () => <div data-testid="ms">paired view</div>;

  it("offers Parsed/Raw/Hex (no Paired) for a normal exchange", () => {
    render(<Inspector exchange={makeExchange()} renderBodySplit={body} />);
    expect(screen.getByText("Parsed")).toBeInTheDocument();
    expect(screen.getByText("Raw")).toBeInTheDocument();
    expect(screen.getByText("Hex")).toBeInTheDocument();
    expect(screen.queryByText("Paired")).not.toBeInTheDocument();
    expect(screen.getByTestId("body-split")).toBeInTheDocument();
  });

  it("adds the Paired option for an msearch exchange", () => {
    render(
      <Inspector
        exchange={makeExchange()}
        isMsearch
        renderBodySplit={body}
        renderMsearch={ms}
      />,
    );
    expect(screen.getByText("Paired")).toBeInTheDocument();
    expect(screen.getByText("Parsed")).toBeInTheDocument();
    // Default mode is parsed → the split renders, not the Paired slot.
    expect(screen.getByTestId("body-split")).toBeInTheDocument();
    expect(screen.queryByTestId("ms")).not.toBeInTheDocument();
  });

  it("hides the selector for an SSE exchange", () => {
    const sse = makeExchange({
      responseBody: {
        chunks: [],
        atEnd: true,
        wireBytes: 0,
        contentType: "text/event-stream",
      },
    });
    render(<Inspector exchange={sse} renderBodySplit={body} />);
    expect(screen.queryByText("Parsed")).not.toBeInTheDocument();
    expect(screen.queryByText("Hex")).not.toBeInTheDocument();
  });

  it("selecting a mode updates the shared store", () => {
    render(<Inspector exchange={makeExchange()} renderBodySplit={body} />);
    // Radix ToggleGroupItem activates on click in jsdom.
    fireEvent.click(screen.getByText("Hex"));
    expect(useStore.getState().bodyViewMode).toBe("hex");
  });

  it("selecting Paired renders the msearch slot instead of the split", () => {
    render(
      <Inspector
        exchange={makeExchange()}
        isMsearch
        renderBodySplit={body}
        renderMsearch={ms}
      />,
    );
    fireEvent.click(screen.getByText("Paired"));
    expect(screen.getByTestId("ms")).toBeInTheDocument();
    expect(screen.queryByTestId("body-split")).not.toBeInTheDocument();
  });
});
