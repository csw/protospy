import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { render } from "@ui/test/render";
import { MarkupView } from "@ui/components/markup-view";
import type { MarkupLine } from "@ui/body/markup-format-core";

const SAMPLE: MarkupLine[] = [
  [
    { type: "punctuation", text: "<" },
    { type: "tag", text: "a" },
    { type: "punctuation", text: ">" },
  ],
  [
    { type: "", text: "  " },
    { type: "attr-name", text: "x" },
    { type: "punctuation", text: "=" },
    { type: "attr-value", text: '"1"' },
  ],
  [{ type: "comment", text: "<!-- note -->" }],
  [{ type: "", text: "plain content" }],
];

describe("MarkupView", () => {
  it("renders one row per line with a line-number gutter", () => {
    render(<MarkupView lines={SAMPLE} label="XML viewer" />);
    expect(screen.getAllByTestId("markup-line")).toHaveLength(4);
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
  });

  it("colors tokens by type via design-token classes", () => {
    render(<MarkupView lines={SAMPLE} label="XML viewer" />);
    expect(screen.getByText("a")).toHaveClass("text-markup-tag");
    expect(screen.getByText("x")).toHaveClass("text-markup-attr-name");
    expect(screen.getByText('"1"')).toHaveClass("text-markup-attr-value");
    expect(screen.getByText("<!-- note -->")).toHaveClass(
      "text-markup-comment",
    );
  });

  it("renders un-highlighted text as foreground", () => {
    render(<MarkupView lines={SAMPLE} label="XML viewer" />);
    expect(screen.getByText("plain content")).toHaveClass("text-foreground");
  });

  it("uses the provided accessible label", () => {
    render(<MarkupView lines={SAMPLE} label="HTML viewer" />);
    expect(screen.getByLabelText("HTML viewer")).toBeInTheDocument();
  });

  it("pads line numbers to the gutter width (min 2 cols)", () => {
    // Alignment comes from padStart inside `whitespace-pre`, not a CSS width:
    // a single-digit line number is space-padded to the 2-col minimum.
    render(<MarkupView lines={SAMPLE} label="XML viewer" />);
    // Raw textContent (jest-dom's toHaveTextContent collapses the padding).
    expect(screen.getAllByTestId("line-number")[0].textContent).toBe(" 1");
  });
});
