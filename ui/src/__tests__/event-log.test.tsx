import { describe, it, expect } from "vitest";
import { useRef } from "react";
import { screen, fireEvent, act } from "@testing-library/react";
import { render } from "@ui/test/render";
import { EventLog, eventTypeClass } from "@ui/components/event-log";
import type { SSEEvent } from "@ui/body/sse";

const ev = (index: number, type: string, data = ""): SSEEvent => ({
  type,
  data,
  index,
});

/**
 * EventLog reads its scroll container from a ref owned by the parent. Provide
 * one via a tiny harness so the virtualizer can mount, mirroring how the stream
 * views wire it. An explicit act() flush lets the virtualizer settle its first
 * visible range (see StreamView tests for the same pattern).
 */
function Harness({ events }: { events: SSEEvent[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  return (
    <div ref={scrollRef} data-testid="scroll" className="h-40 overflow-auto">
      <EventLog events={events} scrollRef={scrollRef} />
    </div>
  );
}

async function renderAndSettle(ui: React.ReactElement) {
  const result = render(ui);
  await act(async () => {});
  return result;
}

describe("eventTypeClass", () => {
  it("maps known SSE event types to semantic token text colors", () => {
    // lifecycle / boundary events → sse-lifecycle token (amber)
    expect(eventTypeClass("message_start")).toBe("text-sse-lifecycle");
    expect(eventTypeClass("content_block_start")).toBe("text-sse-lifecycle");
    expect(eventTypeClass("content_block_stop")).toBe("text-sse-lifecycle");
    // data-carrying events → ok (green)
    expect(eventTypeClass("content_block_delta")).toBe("text-ok");
    // metadata delta → secondary
    expect(eventTypeClass("message_delta")).toBe("text-secondary-foreground");
    // terminal → muted
    expect(eventTypeClass("message_stop")).toBe("text-muted-foreground");
    // keepalive noise → very muted
    expect(eventTypeClass("ping")).toBe("text-muted-foreground/70");
  });

  it("falls back to secondary-foreground for unknown types", () => {
    expect(eventTypeClass("message")).toBe("text-secondary-foreground");
    expect(eventTypeClass("")).toBe("text-secondary-foreground");
  });
});

describe("EventLog", () => {
  it("renders an event-type label and a data summary per event", async () => {
    await renderAndSettle(
      <Harness events={[ev(0, "ping", "keepalive"), ev(1, "message", "hi")]} />,
    );
    expect(screen.getByText("ping")).toBeInTheDocument();
    expect(screen.getByText("message")).toBeInTheDocument();
    expect(screen.getByText("keepalive")).toBeInTheDocument();
  });

  it("colors the type label with the scaffold's semantic token (no pill)", async () => {
    await renderAndSettle(<Harness events={[ev(0, "ping", "x")]} />);
    const label = screen.getByText("ping");
    expect(label).toHaveClass("text-muted-foreground/70");
    // The legacy filled-pill vocabulary must be gone.
    expect(label).not.toHaveClass("bg-secondary");
  });

  it("surfaces the classifyEvent kind on each row as data-kind", async () => {
    await renderAndSettle(<Harness events={[ev(0, "ping", "x")]} />);
    // The O2 classification seam is live — every variant is "generic" today.
    expect(screen.getByText("ping").closest("[data-kind]")).toHaveAttribute(
      "data-kind",
      "generic",
    );
  });

  it("shows 'No events yet' when empty", async () => {
    await renderAndSettle(<Harness events={[]} />);
    expect(screen.getByText("No events yet")).toBeInTheDocument();
  });

  it("truncates long event data with an ellipsis", async () => {
    const long = "a".repeat(120);
    await renderAndSettle(<Harness events={[ev(0, "message", long)]} />);
    expect(screen.getByText(`${"a".repeat(80)}…`)).toBeInTheDocument();
  });

  it("renders rows as non-interactive containers (no row <button>)", async () => {
    // The row is a plain <div>; its only control is the expand toggle. This is
    // what keeps that toggle's <button> from nesting inside a row <button>.
    await renderAndSettle(<Harness events={[ev(0, "ping", "x")]} />);
    const row = screen.getByText("ping").closest("[data-kind]");
    expect(row).not.toBeNull();
    expect(row?.tagName).toBe("DIV");
  });

  it("never nests a <button> inside another <button>", async () => {
    // Long data renders the expand toggle. It must never be a descendant of
    // another <button> — nested buttons are invalid DOM and trigger a React
    // validation error (the PRO-440 regression).
    const long = "a".repeat(120);
    const { container } = await renderAndSettle(
      <Harness events={[ev(0, "message", long)]} />,
    );
    for (const button of container.querySelectorAll("button")) {
      expect(button.querySelector("button")).toBeNull();
    }
  });

  describe("expand affordance", () => {
    it("shows no expand button for short data", async () => {
      await renderAndSettle(<Harness events={[ev(0, "ping", "short")]} />);
      expect(
        screen.queryByRole("button", { name: /expand event data/i }),
      ).not.toBeInTheDocument();
    });

    it("shows an expand button for data longer than 80 characters", async () => {
      const long = "x".repeat(100);
      await renderAndSettle(<Harness events={[ev(0, "message", long)]} />);
      expect(
        screen.getByRole("button", { name: /expand event data/i }),
      ).toBeInTheDocument();
    });

    it("expands to show full data on click and collapses again", async () => {
      const long = "a".repeat(100);
      await renderAndSettle(<Harness events={[ev(0, "message", long)]} />);

      // Initially truncated.
      expect(screen.getByText(`${"a".repeat(80)}…`)).toBeInTheDocument();
      expect(screen.queryByText(long)).not.toBeInTheDocument();

      const expandBtn = screen.getByRole("button", {
        name: /expand event data/i,
      });
      expect(expandBtn).toHaveAttribute("aria-expanded", "false");

      fireEvent.click(expandBtn);

      // Now shows full data.
      expect(screen.getByText(long)).toBeInTheDocument();
      expect(screen.queryByText(`${"a".repeat(80)}…`)).not.toBeInTheDocument();
      expect(expandBtn).toHaveAttribute("aria-expanded", "true");

      fireEvent.click(expandBtn);

      // Collapsed again.
      expect(screen.getByText(`${"a".repeat(80)}…`)).toBeInTheDocument();
      expect(expandBtn).toHaveAttribute("aria-expanded", "false");
    });
  });
});
