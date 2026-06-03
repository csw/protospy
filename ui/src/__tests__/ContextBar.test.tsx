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

  it("Jaeger placeholder button is disabled", () => {
    const { exchange, ordered } = setupTracedExchange();
    render(<ContextBar exchange={exchange} ordered={ordered} currentIdx={0} />);
    const btn = screen.getByLabelText("Open in Jaeger");
    expect(btn).toBeDisabled();
  });

  // Button's base adds `disabled:pointer-events-none`, which would suppress
  // the hover tooltip on disabled controls — including the Jaeger placeholder,
  // whose whole purpose is its "coming soon" tooltip. The disabled-capable
  // controls override it with `disabled:pointer-events-auto` so the tooltip
  // still fires. (With a single exchange, prev/next are both disabled too.)
  it("disabled controls keep pointer events so tooltips still fire", () => {
    const { exchange, ordered } = setupTracedExchange();
    render(<ContextBar exchange={exchange} ordered={ordered} currentIdx={0} />);

    for (const label of [
      "Previous exchange",
      "Next exchange",
      "Open in Jaeger",
    ]) {
      const btn = screen.getByLabelText(label);
      expect(btn).toBeDisabled();
      expect(btn.className).toContain("disabled:pointer-events-auto");
    }
  });

  // After adopting the shadcn Button primitive (PRO-294), the hand-rolled
  // `focus-visible:ring-1 …` boilerplate is gone — Button supplies the focus
  // ring via `focus-visible:ring-[3px] focus-visible:ring-ring/50`. These
  // tests assert the controls carry Button's focus-ring classes (proving the
  // primitive is in use), so focus visibility is preserved. (The rendered
  // `data-slot` is `tooltip-trigger`, not `button`, because the Radix
  // TooltipTrigger Slot merges its own slot attribute onto the child.)
  const FOCUS_RING_CLASSES = [
    "focus-visible:ring-[3px]",
    "focus-visible:ring-ring/50",
  ];

  it("trace pill buttons render via Button with focus-ring classes", () => {
    const { exchange, ordered } = setupTracedExchange();
    render(<ContextBar exchange={exchange} ordered={ordered} currentIdx={0} />);

    for (const label of [
      "Filter by trace",
      "Copy trace ID",
      "Open in Jaeger",
    ]) {
      const btn = screen.getByLabelText(label);
      expect(btn.tagName).toBe("BUTTON");
      for (const cls of FOCUS_RING_CLASSES) {
        expect(btn.className).toContain(cls);
      }
    }
  });

  it("nav buttons render via Button with focus-ring classes", () => {
    const { exchange, ordered } = setupTracedExchange();
    render(<ContextBar exchange={exchange} ordered={ordered} currentIdx={0} />);

    for (const label of ["Previous exchange", "Next exchange"]) {
      const btn = screen.getByLabelText(label);
      expect(btn.tagName).toBe("BUTTON");
      for (const cls of FOCUS_RING_CLASSES) {
        expect(btn.className).toContain(cls);
      }
    }
  });
});
