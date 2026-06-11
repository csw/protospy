import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Button } from "@ui/components/ui/button";

describe("Button", () => {
  it("sm size renders with 26px height class (catalog density target)", () => {
    const { container } = render(<Button size="sm">Label</Button>);
    const btn = container.querySelector('[data-slot="button"]');
    expect(btn).toHaveClass("h-[26px]");
  });

  it("sm size renders with text-xs class (catalog density target)", () => {
    const { container } = render(<Button size="sm">Label</Button>);
    const btn = container.querySelector('[data-slot="button"]');
    expect(btn).toHaveClass("text-xs");
  });

  it("icon-chrome size renders at 28px (size-7) for app chrome icon buttons", () => {
    const { container } = render(<Button size="icon-chrome">icon</Button>);
    const btn = container.querySelector('[data-slot="button"]');
    expect(btn).toHaveClass("size-7");
  });

  it("icon-xs size remains 24px (size-6) for inline icon buttons", () => {
    const { container } = render(<Button size="icon-xs">icon</Button>);
    const btn = container.querySelector('[data-slot="button"]');
    expect(btn).toHaveClass("size-6");
  });
});
