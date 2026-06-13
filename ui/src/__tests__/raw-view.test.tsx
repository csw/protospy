import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { render } from "@ui/test/render";
import { RawView } from "@ui/components/raw-view";

describe("RawView", () => {
  it("renders a line-number gutter, one entry per source line", () => {
    render(<RawView text={"alpha\nbeta\ngamma"} />);
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("alpha")).toBeInTheDocument();
    expect(screen.getByText("gamma")).toBeInTheDocument();
  });

  it("wraps long lines rather than scrolling horizontally", () => {
    const long = "x".repeat(500);
    render(<RawView text={long} />);
    const content = screen.getByText(long);
    expect(content).toHaveClass("whitespace-pre-wrap");
    expect(content).toHaveClass("break-words");
  });

  it("renders a single empty line for an empty body", () => {
    render(<RawView text="" />);
    expect(screen.getByText("1")).toBeInTheDocument();
  });
});
