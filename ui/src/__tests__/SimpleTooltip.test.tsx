import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { render } from "@ui/test/render";
import { SimpleTooltip } from "@ui/components/ui/SimpleTooltip";

describe("SimpleTooltip", () => {
  it("renders children unwrapped when content is falsy", () => {
    render(
      <SimpleTooltip content={undefined}>
        <button>Click me</button>
      </SimpleTooltip>,
    );
    const btn = screen.getByRole("button", { name: "Click me" });
    expect(btn).toBeInTheDocument();
    // No Radix tooltip wrapper — no data-state attribute
    expect(btn).not.toHaveAttribute("data-state");
  });

  it("wraps children in a Radix Tooltip when content is truthy", () => {
    render(
      <SimpleTooltip content="Help text">
        <button>Hover me</button>
      </SimpleTooltip>,
    );
    const btn = screen.getByRole("button", { name: "Hover me" });
    expect(btn).toBeInTheDocument();
    // Radix adds data-state to the trigger element
    expect(btn).toHaveAttribute("data-state");
  });

  it("renders with empty string content as falsy (no tooltip)", () => {
    render(
      <SimpleTooltip content="">
        <button>No tip</button>
      </SimpleTooltip>,
    );
    const btn = screen.getByRole("button", { name: "No tip" });
    expect(btn).not.toHaveAttribute("data-state");
  });
});
