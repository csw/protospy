import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { EventMessage } from "@bindings/EventMessage";
import { StatusBar } from "@ui/components/StatusBar";
import { useStore } from "@ui/state/store";
import { makeGetRequest } from "@ui/test/fixtures";

describe("StatusBar", () => {
  beforeEach(() => {
    useStore.setState(useStore.getInitialState(), true);
  });

  describe("connection status", () => {
    it('renders an amber pulsing dot and "connecting" text when connection is "connecting"', () => {
      useStore.getState().setConnection("connecting");
      const { container } = render(<StatusBar />);
      expect(screen.getByText("connecting")).toBeInTheDocument();
      const dot = container.querySelector("span.rounded-full");
      expect(dot).not.toBeNull();
      expect(dot).toHaveClass("bg-amber");
      expect(dot).toHaveClass("animate-pulse");
    });

    it('renders a green non-pulsing dot and "connected" text when connection is "open"', () => {
      useStore.getState().setConnection("open");
      const { container } = render(<StatusBar />);
      expect(screen.getByText("connected")).toBeInTheDocument();
      const dot = container.querySelector("span.rounded-full");
      expect(dot).not.toBeNull();
      expect(dot).toHaveClass("bg-green");
      expect(dot).not.toHaveClass("animate-pulse");
    });

    it('renders a red pulsing dot and "reconnecting" text when connection is "reconnecting"', () => {
      useStore.getState().setConnection("reconnecting");
      const { container } = render(<StatusBar />);
      expect(screen.getByText("reconnecting")).toBeInTheDocument();
      const dot = container.querySelector("span.rounded-full");
      expect(dot).not.toBeNull();
      expect(dot).toHaveClass("bg-red");
      expect(dot).toHaveClass("animate-pulse");
    });
  });

  describe("service name", () => {
    it("renders the service name with arrow prefix when set", () => {
      useStore.getState().setService("test-backend");
      render(<StatusBar />);
      expect(screen.getByText("→ test-backend")).toBeInTheDocument();
    });

    it("does not render service text when service is null", () => {
      // Initial state has service === null.
      expect(useStore.getState().service).toBeNull();
      render(<StatusBar />);
      expect(screen.queryByText(/→/)).not.toBeInTheDocument();
    });
  });

  describe("request count", () => {
    it('renders "0 requests" when no exchanges have been applied', () => {
      render(<StatusBar />);
      expect(screen.getByText("0 requests")).toBeInTheDocument();
    });

    it('renders "1 request" (singular) for exactly one exchange', () => {
      useStore
        .getState()
        .applyEvent(makeGetRequest(1) as unknown as EventMessage);
      render(<StatusBar />);
      expect(screen.getByText("1 request")).toBeInTheDocument();
    });

    it('renders "N requests" (plural) for multiple exchanges', () => {
      const store = useStore.getState();
      store.applyEvent(makeGetRequest(1) as unknown as EventMessage);
      store.applyEvent(makeGetRequest(2) as unknown as EventMessage);
      store.applyEvent(makeGetRequest(3) as unknown as EventMessage);
      render(<StatusBar />);
      expect(screen.getByText("3 requests")).toBeInTheDocument();
    });
  });
});
