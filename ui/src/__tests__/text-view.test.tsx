import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { render } from "@ui/test/render";
import { TextView } from "@ui/components/text-view";

describe("TextView", () => {
  it("renders a line-number gutter, one entry per source line", () => {
    render(<TextView text={"alpha\nbeta\ngamma"} />);
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("alpha")).toBeInTheDocument();
    expect(screen.getByText("gamma")).toBeInTheDocument();
  });

  it("wraps long lines rather than scrolling horizontally", () => {
    const long = "x".repeat(500);
    render(<TextView text={long} />);
    const content = screen.getByText(long);
    expect(content).toHaveClass("whitespace-pre-wrap");
    expect(content).toHaveClass("break-words");
  });

  it("renders a single empty line for an empty body", () => {
    render(<TextView text="" />);
    expect(screen.getByText("1")).toBeInTheDocument();
  });
});
