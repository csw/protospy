import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { render } from "@ui/test/render";
import { BodyPane } from "@ui/components/body-pane";
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

  it("renders a single size (no slash) for an uncompressed body", async () => {
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
    expect(sizeEl).not.toHaveTextContent("/");
    // No tooltip when there's only one size to show — SimpleTooltip renders
    // children unwrapped when content is falsy, so no Radix data-state attr.
    expect(sizeEl).not.toHaveAttribute("data-state");
  });

  it("renders wire / decoded with a tooltip for a compressed body", async () => {
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
    await waitFor(() => expect(sizeEl).toHaveTextContent("28B / 24B"));
    // Radix Tooltip adds data-state to the trigger when a tooltip is wired up.
    // This confirms SimpleTooltip received truthy content (the decompression detail).
    expect(sizeEl).toHaveAttribute("data-state");
  });

  it("renders the short media type slug and keeps the raw header in a tooltip", async () => {
    const result: DecodeResult = {
      kind: "json",
      text: '{"ok":true}',
      mediaType: "application/json; charset=utf-8",
      wireBytes: 28,
    };
    decodeBodyMock.mockResolvedValueOnce(result);

    render(<BodyPane title="Response" body={makeBody({ wireBytes: 28 })} />);

    const mediaType = await screen.findByTestId("body-media-type");
    expect(mediaType).toHaveTextContent("json");
    expect(mediaType).not.toHaveTextContent("application/json");
    expect(mediaType).toHaveAttribute("data-state");
  });
});

describe("BodyPane error display (PRO-220)", () => {
  beforeEach(() => {
    decodeBodyMock.mockReset();
  });

  it("renders error message when body is absent and errorMessage is set", () => {
    render(
      <BodyPane
        title="Response"
        body={undefined}
        errorMessage="connection refused (os error 111)"
      />,
    );
    expect(
      screen.getByText("connection refused (os error 111)"),
    ).toBeInTheDocument();
    expect(screen.getByText("Error")).toBeInTheDocument();
  });

  it("renders 'No body' when body is absent and no error", () => {
    render(<BodyPane title="Response" body={undefined} />);
    expect(screen.getByText("No body")).toBeInTheDocument();
  });

  it("renders 'Awaiting response…' (not 'No body') when the response has not begun", () => {
    render(<BodyPane title="Response" body={undefined} awaiting />);
    expect(screen.getByText("Awaiting response…")).toBeInTheDocument();
    expect(screen.queryByText("No body")).not.toBeInTheDocument();
  });

  it("announces lifecycle placeholders via an aria-live status region", () => {
    render(<BodyPane title="Response" body={undefined} awaiting />);
    const region = screen.getByRole("status");
    expect(region).toHaveTextContent("Awaiting response…");
  });

  it("renders mid-stream error banner when body exists and errorMessage is set", async () => {
    const result: DecodeResult = {
      kind: "text",
      text: "partial data",
      mediaType: "text/plain",
      wireBytes: 12,
    };
    decodeBodyMock.mockResolvedValueOnce(result);

    render(
      <BodyPane
        title="Response"
        body={makeBody({ wireBytes: 12 })}
        errorMessage="connection reset by peer"
      />,
    );

    // The error banner appears below body content
    await waitFor(() =>
      expect(screen.getByText("connection reset by peer")).toBeInTheDocument(),
    );
  });

  it("renders 'Response interrupted' when body has not ended and errorMessage is set", () => {
    render(
      <BodyPane
        title="Response"
        body={makeBody({ atEnd: false, wireBytes: 500 })}
        errorMessage="connection reset by peer"
      />,
    );
    expect(screen.getByText("Response interrupted")).toBeInTheDocument();
    expect(screen.getByText("connection reset by peer")).toBeInTheDocument();
    expect(screen.getByText("500B received before error")).toBeInTheDocument();
  });
});
