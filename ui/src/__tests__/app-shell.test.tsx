import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, fireEvent, screen } from "@testing-library/react";
import type { EventMessage } from "@bindings/EventMessage";
import { render } from "@ui/test/render";
import { makeGetRequest, makeResponse } from "@ui/test/fixtures";
import { useStore } from "@ui/state/store";
import { AppShell } from "@ui/components/protospy/app-shell";

const mocks = vi.hoisted(() => ({
  fetchInfo: vi.fn(),
  subscribeToEvents: vi.fn(),
  resize: vi.fn(),
}));

vi.mock("@ui/api/info", () => ({
  fetchInfo: mocks.fetchInfo,
}));

vi.mock("@ui/api/sse", () => ({
  subscribeToEvents: mocks.subscribeToEvents,
}));

vi.mock("react-resizable-panels", () => ({
  usePanelRef: () => ({ current: { resize: mocks.resize } }),
}));

vi.mock("@ui/components/ui/resizable", () => ({
  ResizablePanelGroup: ({
    children,
    ...props
  }: React.HTMLAttributes<HTMLDivElement>) => (
    <div data-testid="panel-group" {...props}>
      {children}
    </div>
  ),
  ResizablePanel: ({
    children,
    defaultSize,
    minSize,
    ...props
  }: React.HTMLAttributes<HTMLDivElement> & {
    defaultSize?: string;
    minSize?: string;
    panelRef?: unknown;
  }) => {
    const { panelRef, ...domProps } = props;
    void panelRef;
    return (
      <div
        data-panel
        data-default-size={defaultSize}
        data-min-size={minSize}
        {...domProps}
      >
        {children}
      </div>
    );
  },
  ResizableHandle: ({
    onDoubleClick,
  }: {
    onDoubleClick?: React.MouseEventHandler<HTMLButtonElement>;
  }) => (
    <button type="button" role="separator" onDoubleClick={onDoubleClick}>
      resize
    </button>
  ),
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

describe("AppShell", () => {
  beforeEach(() => {
    resetStore();
    mocks.fetchInfo.mockReset();
    mocks.subscribeToEvents.mockReset();
    mocks.resize.mockReset();
    mocks.subscribeToEvents.mockReturnValue(vi.fn());
    mocks.fetchInfo.mockResolvedValue({
      started_at: "2026-06-11T00:00:00Z",
      services: [
        {
          name: "api",
          addr: "127.0.0.1:3000",
          target: "http://localhost:9200",
          protocol: "Elasticsearch",
          subscribers: 0,
        },
      ],
    });
  });

  it("wires backend discovery, scaffold panel percentages, slots, and keyboard shortcuts", async () => {
    applyMessages(makeGetRequest(1, "/api/users"), makeResponse(1, "200 OK"));
    useStore.getState().setSelectedId(1);

    render(
      <AppShell
        renderBodySplit={(exchange, protocol) => (
          <div>
            body {exchange.id} {protocol}
          </div>
        )}
      />,
    );

    expect(await screen.findByText("api")).toBeInTheDocument();
    expect(mocks.fetchInfo).toHaveBeenCalledOnce();
    expect(mocks.subscribeToEvents).toHaveBeenCalledWith(
      "api",
      expect.any(Function),
      expect.any(Function),
    );

    const panels = screen
      .getAllByTestId("panel-group")[0]
      .querySelectorAll("[data-panel]");
    expect(panels[0]).toHaveAttribute("data-default-size", "46%");
    expect(panels[0]).toHaveAttribute("data-min-size", "26%");
    expect(panels[1]).toHaveAttribute("data-default-size", "54%");
    expect(panels[1]).toHaveAttribute("data-min-size", "30%");
    expect(screen.getByText("body 1 Elasticsearch")).toBeInTheDocument();

    fireEvent.doubleClick(screen.getByRole("separator"));
    expect(mocks.resize).toHaveBeenCalledWith("46%");

    fireEvent.keyDown(window, { key: "/" });
    expect(screen.getByLabelText("Filter requests")).toHaveFocus();

    fireEvent.keyDown(window, { key: "?" });
    expect(useStore.getState().helpOpen).toBe(true);

    act(() => useStore.getState().setHelpOpen(false));
    fireEvent.keyDown(window, { key: "k", metaKey: true });
    expect(useStore.getState().cmdKOpen).toBe(true);

    fireEvent.keyDown(window, { key: "k", metaKey: true });
    expect(useStore.getState().cmdKOpen).toBe(false);
  });

  it("does not let late backend discovery override a selected service", async () => {
    let resolveInfo: (
      value: Awaited<ReturnType<typeof import("@ui/api/info").fetchInfo>>,
    ) => void = () => {};
    mocks.fetchInfo.mockReturnValue(
      new Promise((resolve) => {
        resolveInfo = resolve;
      }),
    );
    useStore.getState().setService("search");

    render(<AppShell renderBodySplit={() => <div>body</div>} />);

    resolveInfo({
      started_at: "2026-06-11T00:00:00Z",
      services: [
        {
          name: "api",
          addr: "127.0.0.1:3000",
          target: "http://localhost:9200",
          protocol: "Elasticsearch",
          subscribers: 0,
        },
        {
          name: "search",
          addr: "127.0.0.1:3001",
          target: "http://localhost:9300",
          protocol: "Elasticsearch",
          subscribers: 0,
        },
      ],
    });

    expect(await screen.findByText("search")).toBeInTheDocument();
    expect(useStore.getState().service).toBe("search");
  });

  it("does not run global navigation shortcuts while dialogs are open", () => {
    applyMessages(makeGetRequest(1, "/one"), makeGetRequest(2, "/two"));
    useStore.getState().setSelectedId(1);
    useStore.getState().setCmdKOpen(true);

    render(<AppShell renderBodySplit={() => <div>body</div>} />);

    fireEvent.keyDown(window, { key: "j" });
    expect(useStore.getState().selectedId).toBe(1);

    act(() => {
      useStore.getState().setCmdKOpen(false);
      useStore.getState().setHelpOpen(true);
    });
    fireEvent.keyDown(window, { key: "/" });
    expect(screen.getByLabelText("Filter requests")).not.toHaveFocus();
  });
});
