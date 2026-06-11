import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Toggle } from "@ui/components/ui/toggle";

describe("Toggle", () => {
  it("icon-chrome size renders at 28px (size-7) for chrome icon toggles", () => {
    const { container } = render(
      <Toggle size="icon-chrome" aria-label="Test">
        X
      </Toggle>,
    );
    const el = container.querySelector('[data-slot="toggle"]');
    expect(el).toHaveClass("size-7");
    expect(el).toHaveClass("rounded-md");
  });

  it("pressed=true sets aria-pressed='true' (binary toggle ARIA contract)", () => {
    render(
      <Toggle pressed aria-label="Grouped">
        X
      </Toggle>,
    );
    expect(screen.getByRole("button", { name: "Grouped" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("pressed=false sets aria-pressed='false'", () => {
    render(
      <Toggle pressed={false} aria-label="Grouped">
        X
      </Toggle>,
    );
    expect(screen.getByRole("button", { name: "Grouped" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("default variant carries aria-pressed active-state classes", () => {
    const { container } = render(
      <Toggle pressed aria-label="Test">
        X
      </Toggle>,
    );
    const el = container.querySelector('[data-slot="toggle"]');
    expect(el).toHaveClass(
      "aria-pressed:bg-primary/10",
      "aria-pressed:text-primary",
    );
  });
});
