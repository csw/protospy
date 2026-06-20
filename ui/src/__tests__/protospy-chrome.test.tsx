import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import type { EventMessage } from "@bindings/EventMessage";
import type { Exchange } from "@ui/state/types";
import { render } from "@ui/test/render";
import {
  makeGetRequest,
  makeRequestWithTrace,
  makeResponse,
} from "@ui/test/fixtures";
import { useStore } from "@ui/state/store";
import { TopBar } from "@ui/components/top-bar";
import { FilterBar } from "@ui/components/filter-bar";
import { StatusBar } from "@ui/components/status-bar";
import { ListToolbar } from "@ui/components/list-toolbar";
import { CommandPalette } from "@ui/components/command-palette";
import { ShortcutsOverlay } from "@ui/components/shortcuts-overlay";
import { EmptyState } from "@ui/components/empty-state";
import { ConnectionDot, connDotStatus } from "@ui/components/connection-dot";
import { GroupedExchangeList, TraceGroup } from "@ui/components/trace-group";

const setTheme = vi.fn();

vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "system", setTheme }),
}));

function resetStore() {
  useStore.setState(useStore.getInitialState(), true);
  localStorage.clear();
}

function applyMessages(...messages: Record<string, unknown>[]) {
  for (const msg of messages) {
    useStore.getState().applyEvent(msg as unknown as EventMessage);
  }
}

function ex(overrides: Partial<Exchange> = {}): Exchange {
  return {
    id: 1,
    timestamp: "2026-06-08T12:00:00.000Z",
    method: "GET",
    uri: "/api/users",
    status: "200 OK",
    elapsedMs: 12,
    requestBody: { chunks: [], atEnd: true, wireBytes: 0 },
    responseBody: { chunks: [], atEnd: true, wireBytes: 0 },
    ...overrides,
  };
}

describe("protospy chrome components", () => {
  beforeEach(() => {
    resetStore();
    setTheme.mockReset();
  });

  it("filters requests, shows active trace state, and clears trace filters", () => {
    const traceId = "0123456789abcdef0123456789abcdef";
    applyMessages(
      makeRequestWithTrace(1, traceId, "/api/users"),
      makeResponse(1, "200 OK"),
      makeGetRequest(2, "/health"),
      makeResponse(2, "204 No Content"),
    );
    useStore.getState().setTraceFilter(traceId);

    render(<FilterBar />);

    expect(screen.getByText("1 of 2")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Filter requests"), {
      target: { value: "health" },
    });
    expect(useStore.getState().filter).toBe("health");

    fireEvent.click(screen.getByRole("button", { name: /trace 0123/i }));
    expect(useStore.getState().traceFilter).toBeNull();
  });

  it("renders status details and opens shortcut help from the footer", () => {
    applyMessages(makeGetRequest(7, "/api/users"), makeResponse(7, "200 OK"));
    useStore.getState().setConnection("open");
    useStore.getState().setSelectedId(7);
    const onShowHelp = vi.fn();

    render(
      <StatusBar upstream="http://localhost:9200" onShowHelp={onShowHelp} />,
    );

    expect(screen.getByText("connected")).toBeInTheDocument();
    expect(screen.getByText("http://localhost:9200")).toBeInTheDocument();
    expect(screen.getByText("1 request")).toBeInTheDocument();
    expect(screen.getByText("#7")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /shortcuts/i }));
    expect(onShowHelp).toHaveBeenCalledOnce();
  });

  it("uses store-backed list toolbar controls", () => {
    render(<ListToolbar />);

    fireEvent.click(screen.getByRole("radio", { name: "UTC" }));
    expect(useStore.getState().timeZone).toBe("utc");

    fireEvent.click(screen.getByRole("button", { name: /newest first/i }));
    expect(useStore.getState().order).toBe("oldest");

    fireEvent.click(screen.getByRole("radio", { name: "Rows view" }));
    expect(useStore.getState().listMode).toBe("rows");
  });

  it("runs command palette commands and trace jumps", async () => {
    const traceId = "abcdef0123456789abcdef0123456789";
    applyMessages(
      makeRequestWithTrace(3, traceId, "/traced"),
      makeResponse(3, "200 OK"),
    );
    useStore.getState().setCmdKOpen(true);
    const onFocusFilter = vi.fn();

    render(<CommandPalette onFocusFilter={onFocusFilter} />);

    fireEvent.click(screen.getByText("Compact density"));
    expect(useStore.getState().density).toBe("compact");
    expect(useStore.getState().cmdKOpen).toBe(false);

    act(() => useStore.getState().setCmdKOpen(true));
    fireEvent.click(screen.getByText("Focus the filter"));
    await waitFor(() => expect(onFocusFilter).toHaveBeenCalledOnce());
    expect(useStore.getState().cmdKOpen).toBe(false);

    act(() => useStore.getState().setCmdKOpen(true));
    fireEvent.click(screen.getByRole("option", { name: /trace abcd/i }));
    expect(useStore.getState().traceFilter).toBe(traceId);
    expect(useStore.getState().selectedId).toBe(3);

    act(() => useStore.getState().setCmdKOpen(true));
    fireEvent.click(screen.getByText("Dark"));
    expect(setTheme).toHaveBeenCalledWith("dark");
  });

  it("renders and closes the shortcut overlay from store state", () => {
    useStore.getState().setHelpOpen(true);

    render(<ShortcutsOverlay />);

    expect(screen.getByRole("dialog")).toHaveTextContent("Keyboard shortcuts");
    expect(screen.getAllByText("Next request")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(useStore.getState().helpOpen).toBe(false);
  });

  it("renders all empty-list variants and connection mapping", () => {
    const { rerender } = render(<EmptyState />);
    expect(screen.getByText("No requests yet")).toBeInTheDocument();

    rerender(<EmptyState kind="filtered" />);
    expect(
      screen.getByText("No requests match your filter"),
    ).toBeInTheDocument();

    rerender(<EmptyState kind="connecting" />);
    expect(screen.getByText("Connecting to proxy…")).toBeInTheDocument();

    expect(connDotStatus("reconnecting")).toBe("connecting");
    rerender(<ConnectionDot status="down" />);
    expect(screen.getByRole("status")).toHaveAccessibleName("disconnected");
  });

  it("wires top-bar service, grouping, density, palette, and theme controls", async () => {
    useStore.getState().setService("api");
    const onSwitchService = vi.fn();

    render(
      <TopBar
        onSwitchService={onSwitchService}
        services={[
          {
            name: "api",
            upstream: "http://localhost:9200",
            addr: "127.0.0.1:3000",
            connection: "open",
          },
          {
            name: "search",
            upstream: "http://localhost:9300",
            addr: "127.0.0.1:3001",
            connection: "connecting",
          },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /jump to/i }));
    expect(useStore.getState().cmdKOpen).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: /^group by trace$/i }));
    expect(useStore.getState().traceGroupOn).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: /regular density/i }));
    expect(useStore.getState().density).toBe("compact");

    fireEvent.click(screen.getByRole("button", { name: /theme: system/i }));
    expect(setTheme).toHaveBeenCalledWith("light");

    fireEvent.pointerDown(screen.getByRole("button", { name: /api/i }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /search/i }));
    expect(onSwitchService).toHaveBeenCalledWith("search");
  });

  it("groups multi-member traces and leaves singletons flat", () => {
    const onSelect = vi.fn();
    const onHoverTrace = vi.fn();
    const onFilterTrace = vi.fn();
    const traceId = "abcdef0123456789abcdef0123456789";

    render(
      <GroupedExchangeList
        exchanges={[
          ex({ id: 1, traceId, uri: "/first" }),
          ex({ id: 2, traceId, uri: "/second" }),
          ex({ id: 3, traceId: undefined, uri: "/solo" }),
        ]}
        selectedId={2}
        onSelect={onSelect}
        onHoverTrace={onHoverTrace}
        onFilterTrace={onFilterTrace}
      />,
    );

    expect(
      screen.getByRole("button", { name: /filter to trace/i }),
    ).toHaveTextContent("trace abcd");
    expect(screen.getByText(/2 requests/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /filter to trace/i }));
    expect(onFilterTrace).toHaveBeenCalledWith(traceId);
    fireEvent.click(screen.getByRole("option", { name: /solo/i }));
    expect(onSelect).toHaveBeenCalledWith(3);
  });

  it("collapses and expands a trace group", () => {
    render(
      <TraceGroup
        traceId="abcdef0123456789abcdef0123456789"
        members={[ex({ id: 1, uri: "/first" }), ex({ id: 2, uri: "/second" })]}
        selectedId={null}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Collapse trace" }));
    expect(screen.queryByText("/first")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Expand trace" }));
    expect(screen.getByText("/first")).toBeInTheDocument();
  });
});
