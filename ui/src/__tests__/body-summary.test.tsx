import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import { render } from "@ui/test/render";
import { BodySummary } from "@ui/components/body-summary";

// BodySummary is the binary-download placeholder. Its size/encoding line routes
// through the shared `buildSizeView`/`sizeText` helper (PRO-266), so it must
// match the spaced `fmtBytes` format, normalized encoding tag, and dual figure
// the list rows / inspector facts use.
describe("BodySummary size display", () => {
  it("renders a single spaced wire size for an uncompressed body", () => {
    render(
      <BodySummary
        mediaType="application/octet-stream"
        wireBytes={12}
        onDownload={vi.fn()}
      />,
    );
    const summary = screen.getByTestId("body-summary");
    // The size line is the second muted span (the first is the media type).
    const sizeLine = summary.querySelectorAll("span")[1];
    expect(sizeLine).toHaveTextContent("12 B");
    // Single size: no dual-figure slash and no encoding marker.
    expect(sizeLine?.textContent).toBe("12 B");
  });

  it("renders the dual figure with the normalized encoding for a compressed body", () => {
    render(
      <BodySummary
        mediaType="application/json"
        wireBytes={1024}
        decodedBytes={4096}
        contentEncoding="gzip"
        onDownload={vi.fn()}
      />,
    );
    const summary = screen.getByTestId("body-summary");
    expect(summary).toHaveTextContent("1.0 KB / 4.0 KB (gzip)");
  });

  it("suppresses an identity Content-Encoding", () => {
    render(
      <BodySummary
        mediaType="application/octet-stream"
        wireBytes={512}
        contentEncoding="identity"
        onDownload={vi.fn()}
      />,
    );
    const summary = screen.getByTestId("body-summary");
    expect(summary).toHaveTextContent("512 B");
    expect(summary).not.toHaveTextContent("identity");
  });
});
