import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { BodyPane } from "@ui/components/BodyPane";
import type { BodyState } from "@ui/state/reducer";
import { decodeBody, type DecodeResult } from "@ui/body/decode";

// Stub decodeBody so the test can drive the dual-size display logic
// directly. The decode pipeline itself is covered in body.decode.test.ts;
// here we only assert how BodyPane renders the result.
vi.mock("@ui/body/decode", () => ({
  decodeBody: vi.fn(),
}));

const decodeBodyMock = vi.mocked(decodeBody);

function makeBody(overrides: Partial<BodyState> = {}): BodyState {
  return {
    chunks: [{ text: "irrelevant" }],
    atEnd: true,
    wireBytes: 28,
    contentType: "application/json",
    ...overrides,
  };
}

describe("BodyPane size display", () => {
  beforeEach(() => {
    decodeBodyMock.mockReset();
  });

  it("renders a single size (no arrow) for an uncompressed body", async () => {
    const result: DecodeResult = {
      kind: "text",
      text: "ok",
      mediaType: "text/plain",
      wireBytes: 11,
      // No decodedBytes — decode pipeline did not run decompression.
    };
    decodeBodyMock.mockResolvedValueOnce(result);

    render(<BodyPane title="Response" body={makeBody({ wireBytes: 11 })} />);

    const sizeEl = await screen.findByTestId("body-size");
    await waitFor(() => expect(sizeEl).toHaveTextContent("11B"));
    expect(sizeEl).not.toHaveTextContent("→");
    // No tooltip when there's only one size to show.
    expect(sizeEl).not.toHaveAttribute("title");
  });

  it("renders wire → decoded with a tooltip for a compressed body", async () => {
    const result: DecodeResult = {
      kind: "json",
      text: '{"ok":true}',
      mediaType: "application/json",
      wireBytes: 28,
      decodedBytes: 24, // bytes after decompression
    };
    decodeBodyMock.mockResolvedValueOnce(result);

    render(<BodyPane title="Response" body={makeBody({ wireBytes: 28 })} />);

    const sizeEl = await screen.findByTestId("body-size");
    await waitFor(() => expect(sizeEl).toHaveTextContent("28B → 24B"));
    expect(sizeEl).toHaveAttribute(
      "title",
      "28B on the wire → 24B after decompression",
    );
  });
});
