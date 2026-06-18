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
      rawText: "ok",
      bytes: new TextEncoder().encode("ok"),
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
      rawText: '{"ok":true}',
      bytes: new TextEncoder().encode('{"ok":true}'),
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
      rawText: '{"ok":true}',
      bytes: new TextEncoder().encode('{"ok":true}'),
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
      rawText: "partial data",
      bytes: new TextEncoder().encode("partial data"),
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

  it("applies wrap-anywhere to error message text so long URLs do not clip (PRO-383)", () => {
    const longError =
      "error sending request for url (https://upstream.internal.example.com:8443/v1/ingest): connection error: connection reset by peer (os error 104); after 3 retries over 12.4s";
    render(
      <BodyPane title="Response" body={undefined} errorMessage={longError} />,
    );
    const msgEl = screen.getByText(longError);
    expect(msgEl).toHaveClass("wrap-anywhere");
  });
});

describe("BodyPane view modes (PRO-420)", () => {
  beforeEach(() => {
    decodeBodyMock.mockReset();
  });

  const text = '{"hello":"world"}';
  const jsonResult: DecodeResult = {
    kind: "json",
    textAvailable: true,
    text: '{\n  "hello": "world"\n}',
    parsed: { hello: "world" },
    mediaType: "application/json",
    wireBytes: text.length,
    rawText: text,
    bytes: new TextEncoder().encode(text),
  };

  function binaryResult(): DecodeResult {
    return {
      kind: "binary",
      textAvailable: false,
      mediaType: "application/octet-stream",
      wireBytes: 12,
      rawText: "",
      bytes: new Uint8Array([0, 1, 2]),
    };
  }

  function imageResult(): DecodeResult {
    return {
      kind: "image",
      textAvailable: false,
      mediaType: "image/png",
      wireBytes: 64,
      rawText: "",
      bytes: new Uint8Array([137, 80, 78, 71]),
    };
  }

  it("tree mode (the JSON default) renders the JSON tree viewer", async () => {
    decodeBodyMock.mockResolvedValueOnce(jsonResult);
    // viewMode null → resolves to the kind's default (tree for JSON).
    render(<BodyPane title="Response" body={makeBody()} />);
    const viewer = await screen.findByLabelText("JSON viewer");
    expect(viewer).toBeInTheDocument();
    expect(viewer).toHaveTextContent('"hello"');
    expect(screen.queryByLabelText("Body text")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Hex viewer")).not.toBeInTheDocument();
  });

  it("tree mode renders the NDJSON document viewer for NDJSON bodies", async () => {
    const ndjsonResult: DecodeResult = {
      kind: "ndjson",
      textAvailable: true,
      text: '{\n  "a": 1\n}\n\n{\n  "b": 2\n}',
      documents: [{ a: 1 }, { b: 2 }],
      mediaType: "application/x-ndjson",
      wireBytes: 16,
      rawText: '{"a":1}\n{"b":2}',
      bytes: new TextEncoder().encode('{"a":1}\n{"b":2}'),
    };
    decodeBodyMock.mockResolvedValueOnce(ndjsonResult);
    render(
      <BodyPane
        title="Response"
        body={makeBody({ contentType: "application/x-ndjson" })}
        viewMode="tree"
      />,
    );
    const viewer = await screen.findByLabelText("NDJSON viewer");
    expect(viewer).toBeInTheDocument();
    expect(viewer.textContent).toContain("1 key");
    expect(viewer.textContent).toContain("1");
    expect(viewer.textContent).toContain("2");
  });

  it("text mode renders the decoded source, not the pretty JSON", async () => {
    decodeBodyMock.mockResolvedValueOnce(jsonResult);
    render(<BodyPane title="Response" body={makeBody()} viewMode="text" />);
    const txt = await screen.findByLabelText("Body text");
    expect(txt).toHaveTextContent('{"hello":"world"}');
    expect(screen.queryByLabelText("JSON viewer")).not.toBeInTheDocument();
  });

  it("hex mode renders a hex + ASCII dump of the bytes", async () => {
    decodeBodyMock.mockResolvedValueOnce(jsonResult);
    render(<BodyPane title="Response" body={makeBody()} viewMode="hex" />);
    const hex = await screen.findByLabelText("Hex viewer");
    // '{' is 0x7b, the first byte of the JSON.
    expect(hex).toHaveTextContent("7b");
    expect(screen.queryByLabelText("JSON viewer")).not.toBeInTheDocument();
  });

  it("falls back to the default when the stored mode is unavailable", async () => {
    // `tree` is not a selectable mode for an image body — resolves to rendered.
    decodeBodyMock.mockResolvedValueOnce(imageResult());
    render(<BodyPane title="Response" body={makeBody()} viewMode="tree" />);
    expect(await screen.findByLabelText("Image view")).toBeInTheDocument();
  });

  it("binary bodies render the summary state with a download button", async () => {
    decodeBodyMock.mockResolvedValueOnce(binaryResult());
    render(<BodyPane title="Response" body={makeBody()} />);
    const summary = await screen.findByTestId("body-summary");
    expect(summary).toHaveTextContent("application/octet-stream");
    expect(
      screen.getByRole("button", { name: "Download" }),
    ).toBeInTheDocument();
  });

  it("hides the copy button for non-image binary bodies", async () => {
    decodeBodyMock.mockResolvedValueOnce(binaryResult());
    render(<BodyPane title="Response" body={makeBody()} />);
    await screen.findByTestId("body-summary");
    expect(
      screen.queryByRole("button", { name: /copy/i }),
    ).not.toBeInTheDocument();
  });

  it("keeps a copy button for image bodies", async () => {
    decodeBodyMock.mockResolvedValueOnce(imageResult());
    render(<BodyPane title="Response" body={makeBody()} />);
    await screen.findByLabelText("Image view");
    expect(screen.getByRole("button", { name: /copy/i })).toBeInTheDocument();
  });

  it("image bodies render an <img> element in the default rendered mode", async () => {
    decodeBodyMock.mockResolvedValueOnce(imageResult());
    render(<BodyPane title="Response" body={makeBody()} />);
    const img = await screen.findByLabelText("Image view");
    expect(img.tagName).toBe("IMG");
    // jsdom implements URL.createObjectURL and returns a blob: URL.
    expect(img.getAttribute("src")).toMatch(/^blob:/);
    // BodySummary placeholder must not be shown once the image renders.
    expect(screen.queryByTestId("body-summary")).not.toBeInTheDocument();
  });

  it("image bodies switch to hex view when the Hex segment is selected", async () => {
    // Share the body ref so useDecodeBody doesn't re-run on rerender.
    const body = makeBody();
    decodeBodyMock.mockResolvedValue(imageResult());
    const { rerender } = render(
      <BodyPane title="Response" body={body} viewMode={null} />,
    );
    await screen.findByLabelText("Image view");

    rerender(<BodyPane title="Response" body={body} viewMode="hex" />);
    await screen.findByLabelText("Hex viewer");
    expect(screen.queryByLabelText("Image view")).not.toBeInTheDocument();
  });

  it("shows a download button in the header strip for all bodies", async () => {
    decodeBodyMock.mockResolvedValueOnce(jsonResult);
    render(<BodyPane title="Response" body={makeBody()} />);
    expect(
      await screen.findByRole("button", { name: "Download body" }),
    ).toBeInTheDocument();
  });
});
