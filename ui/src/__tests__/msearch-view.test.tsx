import { describe, it, expect, vi } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { render } from "@ui/test/render";
import { MsearchView, type SubExchange } from "@ui/components/msearch-view";

// The per-sub body content is a render slot (PRO-56 passes <JsonViewer/>); tests
// pass identifiable marker nodes so each pane's slot can be located unambiguously.
function makeSub(i: number, over: Partial<SubExchange> = {}): SubExchange {
  return {
    index: `logs-${i}`,
    description: `GET match query ${i}`,
    status: 200,
    hits: 5,
    tookMs: 12,
    requestBody: <span>REQ-BODY-{i}</span>,
    responseBody: <span>RES-BODY-{i}</span>,
    ...over,
  };
}

describe("MsearchView", () => {
  it("renders both pane heads with sub counts", () => {
    render(
      <MsearchView
        subs={[makeSub(0), makeSub(1)]}
        focusedIndex={null}
        onFocus={vi.fn()}
      />,
    );
    expect(screen.getByText("Sub-requests")).toBeInTheDocument();
    expect(screen.getByText("2 × _msearch · ndjson")).toBeInTheDocument();
    expect(screen.getByText("Sub-responses")).toBeInTheDocument();
    expect(screen.getByText("2 responses")).toBeInTheDocument();
  });

  it("renders the index, description, and the request/response body slots per sub", () => {
    render(
      <MsearchView subs={[makeSub(0)]} focusedIndex={null} onFocus={vi.fn()} />,
    );
    expect(screen.getByText("logs-0")).toBeInTheDocument();
    expect(screen.getByText("GET match query 0")).toBeInTheDocument();
    expect(screen.getByText("REQ-BODY-0")).toBeInTheDocument();
    // The first response is open by default (defaultOpen on i === 0).
    expect(screen.getByText("RES-BODY-0")).toBeInTheDocument();
  });

  it("colors the status code by its status kind", () => {
    render(
      <MsearchView
        subs={[makeSub(0, { status: 200 }), makeSub(1, { status: 404 })]}
        focusedIndex={null}
        onFocus={vi.fn()}
      />,
    );
    // Stats render in both columns, so each status appears twice.
    expect(screen.getAllByText("200")[0]).toHaveClass("text-ok");
    expect(screen.getAllByText("404")[0]).toHaveClass("text-client");
  });

  it("colors zero-hit subs distinctly and renders the showing count when present", () => {
    render(
      <MsearchView
        subs={[makeSub(0, { hits: 0 }), makeSub(1, { hits: 42, showing: 10 })]}
        focusedIndex={null}
        onFocus={vi.fn()}
      />,
    );
    const zero = screen.getAllByText("0 hits")[0];
    expect(zero).toHaveClass("text-redirect");
    const some = screen.getAllByText("42 hits (showing 10)")[0];
    expect(some).toHaveClass("text-ok");
  });

  it("renders the took time per sub", () => {
    render(
      <MsearchView
        subs={[makeSub(0, { tookMs: 7 })]}
        focusedIndex={null}
        onFocus={vi.fn()}
      />,
    );
    // tookMs appears in both columns' Stats.
    expect(screen.getAllByText("7 ms").length).toBe(2);
  });

  it("focuses a pair when its request head is clicked", () => {
    const onFocus = vi.fn();
    render(
      <MsearchView
        subs={[makeSub(0), makeSub(1)]}
        focusedIndex={null}
        onFocus={onFocus}
      />,
    );
    // The request head is the button carrying the description.
    fireEvent.click(screen.getByText("GET match query 1").closest("button")!);
    expect(onFocus).toHaveBeenCalledWith(1);
  });

  it("unfocuses when the already-focused request head is clicked again", () => {
    const onFocus = vi.fn();
    render(
      <MsearchView subs={[makeSub(0)]} focusedIndex={0} onFocus={onFocus} />,
    );
    fireEvent.click(screen.getByText("GET match query 0").closest("button")!);
    expect(onFocus).toHaveBeenCalledWith(null);
  });

  it("highlights the focused pair on both the request and response sides", () => {
    const { container } = render(
      <MsearchView
        subs={[makeSub(0), makeSub(1)]}
        focusedIndex={1}
        onFocus={vi.fn()}
      />,
    );
    // Request card: climb from the description to its bordered card container.
    const reqCard = screen
      .getByText("GET match query 1")
      .closest("div.rounded-md");
    expect(reqCard).toHaveClass("ring-primary");
    // Exactly two cards carry the focus ring — one per column for the focused
    // index (the response collapsible's trigger renders even while collapsed).
    expect(container.querySelectorAll(".ring-primary")).toHaveLength(2);
  });

  it("marks the focused index badge as selected styling", () => {
    render(
      <MsearchView subs={[makeSub(0)]} focusedIndex={0} onFocus={vi.fn()} />,
    );
    // The badge number "1" renders in both columns; the request-side one is in
    // the head button. Both carry the focused styling.
    const badges = screen.getAllByText("1");
    expect(badges[0]).toHaveClass("bg-primary");
  });
});
