import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ToggleGroup, ToggleGroupItem } from "@ui/components/ui/toggle-group";

describe("ToggleGroup", () => {
  it("renders items with correct aria-labels", () => {
    render(
      <ToggleGroup type="single" value="a" onValueChange={() => {}}>
        <ToggleGroupItem value="a" aria-label="Option A">
          A
        </ToggleGroupItem>
        <ToggleGroupItem value="b" aria-label="Option B">
          B
        </ToggleGroupItem>
      </ToggleGroup>,
    );
    expect(screen.getByLabelText("Option A")).toBeInTheDocument();
    expect(screen.getByLabelText("Option B")).toBeInTheDocument();
  });

  it("marks the active item with data-state=on", () => {
    render(
      <ToggleGroup type="single" value="b" onValueChange={() => {}}>
        <ToggleGroupItem value="a" aria-label="Option A">
          A
        </ToggleGroupItem>
        <ToggleGroupItem value="b" aria-label="Option B">
          B
        </ToggleGroupItem>
      </ToggleGroup>,
    );
    expect(screen.getByLabelText("Option A")).toHaveAttribute(
      "data-state",
      "off",
    );
    expect(screen.getByLabelText("Option B")).toHaveAttribute(
      "data-state",
      "on",
    );
  });

  it("calls onValueChange when an inactive item is clicked", () => {
    const onChange = vi.fn();
    render(
      <ToggleGroup type="single" value="a" onValueChange={onChange}>
        <ToggleGroupItem value="a" aria-label="Option A">
          A
        </ToggleGroupItem>
        <ToggleGroupItem value="b" aria-label="Option B">
          B
        </ToggleGroupItem>
      </ToggleGroup>,
    );
    fireEvent.click(screen.getByLabelText("Option B"));
    expect(onChange).toHaveBeenCalledWith("b");
  });

  it("fires empty string when the active item is clicked (single mode)", () => {
    const onChange = vi.fn();
    render(
      <ToggleGroup type="single" value="a" onValueChange={onChange}>
        <ToggleGroupItem value="a" aria-label="Option A">
          A
        </ToggleGroupItem>
        <ToggleGroupItem value="b" aria-label="Option B">
          B
        </ToggleGroupItem>
      </ToggleGroup>,
    );
    fireEvent.click(screen.getByLabelText("Option A"));
    expect(onChange).toHaveBeenCalledWith("");
  });

  it("applies border classes when bordered is set", () => {
    const { container } = render(
      <ToggleGroup type="single" value="a" onValueChange={() => {}} bordered>
        <ToggleGroupItem value="a">A</ToggleGroupItem>
      </ToggleGroup>,
    );
    const root = container.querySelector('[data-slot="toggle-group"]');
    expect(root).toHaveClass("border", "border-border", "overflow-hidden");
  });

  it("applies border classes when size is sm (catalog density target)", () => {
    const { container } = render(
      <ToggleGroup type="single" value="a" onValueChange={() => {}} size="sm">
        <ToggleGroupItem value="a">A</ToggleGroupItem>
      </ToggleGroup>,
    );
    const root = container.querySelector('[data-slot="toggle-group"]');
    expect(root).toHaveClass("border", "border-border", "overflow-hidden");
  });

  it("renders as a segmented control: secondary track, items carry the segmented on-state fill (PRO-321)", () => {
    const { container } = render(
      <ToggleGroup type="single" value="a" onValueChange={() => {}}>
        <ToggleGroupItem value="a" aria-label="Option A">
          A
        </ToggleGroupItem>
        <ToggleGroupItem value="b" aria-label="Option B">
          B
        </ToggleGroupItem>
      </ToggleGroup>,
    );
    // The group track is the secondary recess the raised on-fill rises from.
    const root = container.querySelector('[data-slot="toggle-group"]');
    expect(root).toHaveClass("bg-secondary");

    // Items use the `segmented` variant: on-state keyed off data-[state=on]
    // (type-agnostic, no accent), raised card fill. Keyed off data-state —
    // not aria-pressed — so it works for both single- and multiple-select.
    const item = screen.getByLabelText("Option A");
    expect(item).toHaveClass(
      "data-[state=on]:bg-card",
      "data-[state=on]:text-foreground",
    );
    // No accent on the segmented on-state.
    expect(item.className).not.toContain("data-[state=on]:bg-accent");
    expect(item.className).not.toContain("aria-pressed:bg-primary/10");
    // shadow-none was removed so the segmented elevation shadow can render.
    expect(item.className).not.toContain("shadow-none");
  });

  it("applies the sm size to items via context", () => {
    render(
      <ToggleGroup type="single" value="a" onValueChange={() => {}} size="sm">
        <ToggleGroupItem value="a" aria-label="Option A">
          A
        </ToggleGroupItem>
      </ToggleGroup>,
    );
    const item = screen.getByLabelText("Option A");
    expect(item).toHaveAttribute("data-size", "sm");
  });

  it("renders items as radio buttons with correct aria-checked", () => {
    render(
      <ToggleGroup
        type="single"
        value="a"
        onValueChange={() => {}}
        aria-label="Test group"
      >
        <ToggleGroupItem value="a" aria-label="Option A">
          A
        </ToggleGroupItem>
        <ToggleGroupItem value="b" aria-label="Option B">
          B
        </ToggleGroupItem>
      </ToggleGroup>,
    );
    // Radix ToggleGroup single renders items with role=radio
    expect(screen.getByLabelText("Option A")).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByLabelText("Option B")).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });
});
