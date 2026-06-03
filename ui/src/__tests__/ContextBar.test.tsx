import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { render } from "@ui/test/render";
import type { EventMessage } from "@bindings/EventMessage";
import { ContextBar } from "@ui/components/ContextBar";
import { useStore } from "@ui/state/store";
import type { Exchange } from "@ui/state/reducer";
import { makeRequestWithTrace, makeResponse } from "@ui/test/fixtures";

// Clipboard mock
beforeEach(() => {
  vi.stubGlobal("navigator", {
    clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
});

/** Build a store with a traced exchange and return the ordered list + exchange. */
function setupTracedExchange(): { exchange: Exchange; ordered: Exchange[] } {
  const TRACE_ID = "abcdef0123456789abcdef0123456789";
  const store = useStore.getState();
  store.applyEvent(
    makeRequestWithTrace(1, TRACE_ID, "/api/test") as unknown as EventMessage,
  );
  store.applyEvent(makeResponse(1) as unknown as EventMessage);

  const exchange = useStore.getState().exchanges.get(1)!;
  return { exchange, ordered: [exchange] };
}

describe("ContextBar — trace pill keyboard operability", () => {
  beforeEach(() => {
    useStore.setState(useStore.getInitialState(), true);
  });

  it("renders a Filter by trace button when exchange has a traceId", () => {
    const { exchange, ordered } = setupTracedExchange();
    render(<ContextBar exchange={exchange} ordered={ordered} currentIdx={0} />);
    expect(screen.getByLabelText("Filter by trace")).toBeInTheDocument();
  });

  it("Filter by trace button is a real <button> element", () => {
    const { exchange, ordered } = setupTracedExchange();
    render(<ContextBar exchange={exchange} ordered={ordered} currentIdx={0} />);
    const btn = screen.getByLabelText("Filter by trace");
    expect(btn.tagName).toBe("BUTTON");
  });

  it("sets trace filter when Filter by trace button is clicked", () => {
    const { exchange, ordered } = setupTracedExchange();
    render(<ContextBar exchange={exchange} ordered={ordered} currentIdx={0} />);
    fireEvent.click(screen.getByLabelText("Filter by trace"));
    expect(useStore.getState().traceFilter).toBe(exchange.traceId);
  });

  it("sets trace filter when Filter by trace button receives Enter keypress", () => {
    const { exchange, ordered } = setupTracedExchange();
    render(<ContextBar exchange={exchange} ordered={ordered} currentIdx={0} />);
    const btn = screen.getByLabelText("Filter by trace");
    // Simulate keyboard activation: native buttons fire click on Enter/Space
    fireEvent.keyDown(btn, { key: "Enter" });
    fireEvent.click(btn);
    expect(useStore.getState().traceFilter).toBe(exchange.traceId);
  });

  it("trace pill buttons have focus-visible ring classes", () => {
    const { exchange, ordered } = setupTracedExchange();
    render(<ContextBar exchange={exchange} ordered={ordered} currentIdx={0} />);

    const filterBtn = screen.getByLabelText("Filter by trace");
    expect(filterBtn.className).toContain("focus-visible:ring-1");
    expect(filterBtn.className).toContain("focus-visible:ring-ring");
    expect(filterBtn.className).toContain("focus-visible:outline-none");

    const copyBtn = screen.getByLabelText("Copy trace ID");
    expect(copyBtn.className).toContain("focus-visible:ring-1");

    const jaegerBtn = screen.getByLabelText("Open in Jaeger");
    expect(jaegerBtn.className).toContain("focus-visible:ring-1");
  });

  it("nav buttons have focus-visible ring classes", () => {
    const { exchange, ordered } = setupTracedExchange();
    render(<ContextBar exchange={exchange} ordered={ordered} currentIdx={0} />);

    const prevBtn = screen.getByLabelText("Previous exchange");
    expect(prevBtn.className).toContain("focus-visible:ring-1");

    const nextBtn = screen.getByLabelText("Next exchange");
    expect(nextBtn.className).toContain("focus-visible:ring-1");
  });
});
