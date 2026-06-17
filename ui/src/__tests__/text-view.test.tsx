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
    expect(content).toHaveClass("wrap-anywhere");
  });

  it("sizes the gutter to fit the actual line count", () => {
    // 3 lines → 1 digit → clamped to 2ch minimum
    render(<TextView text={"a\nb\nc"} />);
    expect(screen.getAllByTestId("line-number")[0]).toHaveStyle({
      width: "2ch",
    });
  });

  it("expands the gutter for large line counts", () => {
    // 100 lines → Math.ceil(log10(101)) = 3 digits
    const hundredLines = Array.from(
      { length: 100 },
      (_, i) => `line ${i + 1}`,
    ).join("\n");
    render(<TextView text={hundredLines} />);
    expect(screen.getAllByTestId("line-number")[0]).toHaveStyle({
      width: "3ch",
    });
  });

  it("does not use a fixed w-10 gutter class", () => {
    render(<TextView text={"hello\nworld"} />);
    expect(screen.getAllByTestId("line-number")[0]).not.toHaveClass("w-10");
  });

  it("renders a single empty line for an empty body", () => {
    render(<TextView text="" />);
    expect(screen.getByText("1")).toBeInTheDocument();
  });
});
