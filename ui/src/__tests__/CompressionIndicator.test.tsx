import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CompressionIndicator } from "@ui/components/CompressionIndicator";

describe("CompressionIndicator", () => {
  it("renders nothing when encoding is undefined", () => {
    const { container } = render(<CompressionIndicator encoding={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when encoding is the empty string", () => {
    const { container } = render(<CompressionIndicator encoding="" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders an indicator with the encoding name in title and aria-label", () => {
    render(<CompressionIndicator encoding="gzip" />);
    const indicator = screen.getByTestId("compression-indicator");
    expect(indicator).toBeInTheDocument();
    expect(indicator).toHaveAttribute("title", "Compressed: gzip");
    expect(indicator).toHaveAttribute("aria-label", "Compressed: gzip");
  });

  it("passes the encoding value through (br/zstd/etc.)", () => {
    render(<CompressionIndicator encoding="br" />);
    const indicator = screen.getByTestId("compression-indicator");
    expect(indicator).toHaveAttribute("title", "Compressed: br");
  });
});
