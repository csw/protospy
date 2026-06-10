import { render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";

import type { ConnectionStatus } from "@ui/api/sse";
import { useStore } from "@ui/state/store";
import { AppShell } from "@ui/components/AppShell";

const fetchInfoMock = vi.fn();
const subscribeToEventsMock = vi.fn();

vi.mock("@ui/api/info", () => ({
  fetchInfo: () => fetchInfoMock(),
}));

vi.mock("@ui/api/sse", () => ({
  subscribeToEvents: (
    serviceName: string,
    onMessage: unknown,
    onStatusChange: (status: ConnectionStatus) => void,
  ) => subscribeToEventsMock(serviceName, onMessage, onStatusChange),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@ui/components/TopBar", () => ({
  TopBar: () => <div data-testid="top-bar" />,
}));

vi.mock("@ui/components/FilterBar", () => ({
  FilterBar: () => <div data-testid="filter-bar" />,
}));

vi.mock("@ui/components/ExchangeList", () => ({
  ExchangeList: () => <div data-testid="exchange-list" />,
}));

vi.mock("@ui/components/InspectorPane", () => ({
  InspectorPane: () => <div data-testid="inspector-pane" />,
}));

vi.mock("@ui/components/StatusBar", () => ({
  StatusBar: () => <div data-testid="status-bar" />,
}));

vi.mock("@ui/components/CommandPalette", () => ({
  CommandPalette: () => <div data-testid="command-palette" />,
}));

describe("AppShell connection toasts", () => {
  beforeEach(() => {
    useStore.setState(useStore.getInitialState(), true);
    fetchInfoMock.mockResolvedValue({
      services: [{ name: "es", target: "http://localhost:9200" }],
    });
    subscribeToEventsMock.mockReturnValue(vi.fn());
    vi.mocked(toast.success).mockClear();
    vi.mocked(toast.error).mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("emits sonner toasts for open and reconnecting SSE states", async () => {
    render(<AppShell />);

    await waitFor(() =>
      expect(subscribeToEventsMock).toHaveBeenCalledWith(
        "es",
        expect.any(Function),
        expect.any(Function),
      ),
    );

    const onStatusChange = subscribeToEventsMock.mock.calls[0][2] as (
      status: ConnectionStatus,
    ) => void;

    onStatusChange("open");
    expect(toast.success).toHaveBeenCalledWith("Connected to es");

    onStatusChange("reconnecting");
    expect(toast.error).toHaveBeenCalledWith("Connection lost. Retrying es...");
  });
});
