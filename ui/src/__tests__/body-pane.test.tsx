import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { render } from "@ui/test/render";
import { BodyPane } from "@ui/components/body-pane";
import type { BodyState } from "@ui/state/reducer";
import { decodeBody, type DecodeResult } from "@ui/body/decode";
import * as downloadLib from "@ui/lib/download";

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

describe("BodyPane download button (PRO-413)", () => {
  beforeEach(() => {
    decodeBodyMock.mockReset();
  });

  const bytes = new TextEncoder().encode('{"ok":true}');
  const jsonResult: DecodeResult = {
    kind: "json",
    text: '{\n  "ok": true\n}',
    parsed: { ok: true },
    mediaType: "application/json",
    wireBytes: bytes.length,
    rawText: '{"ok":true}',
    bytes,
  };

  it("renders a download button in the header when body is present", async () => {
    decodeBodyMock.mockResolvedValueOnce(jsonResult);
    render(<BodyPane title="Response" body={makeBody()} />);
    const btn = await screen.findByRole("button", { name: /download/i });
    expect(btn).toBeInTheDocument();
  });

  it("download button is disabled while result is not yet decoded", () => {
    // body present but decodeBody never resolves → loading state
    decodeBodyMock.mockReturnValue(new Promise(() => {}));
    render(<BodyPane title="Response" body={makeBody()} />);
    // Button is present because body != null, but disabled (no bytes yet)
    const btn = screen.getByRole("button", { name: /download/i });
    expect(btn).toBeDisabled();
  });

  it("download button is enabled once the body is decoded", async () => {
    decodeBodyMock.mockResolvedValueOnce(jsonResult);
    render(<BodyPane title="Response" body={makeBody()} />);
    const btn = await screen.findByRole("button", { name: /download/i });
    await waitFor(() => expect(btn).not.toBeDisabled());
  });

  it("uses Content-Disposition filename when downloadHint is provided", async () => {
    const downloadBytesSpy = vi
      .spyOn(downloadLib, "downloadBytes")
      .mockReturnValue(undefined);

    // jsdom has no real URL.createObjectURL; stub it.
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:fake"),
      revokeObjectURL: vi.fn(),
    });

    decodeBodyMock.mockResolvedValueOnce(jsonResult);
    render(
      <BodyPane
        title="Response"
        body={makeBody()}
        downloadUri="/api/data"
        downloadContentDisposition='attachment; filename="report.json"'
      />,
    );

    const btn = await screen.findByRole("button", { name: /download/i });
    await waitFor(() => expect(btn).not.toBeDisabled());
    btn.click();
    expect(downloadBytesSpy).toHaveBeenCalledOnce();
    const [, calledFilename, calledMime] = downloadBytesSpy.mock.calls[0];
    expect(calledFilename).toBe("report.json");
    expect(calledMime).toBe("application/json");

    downloadBytesSpy.mockRestore();
    vi.unstubAllGlobals();
  });

  it("shows a prominent download button in the binary empty state", async () => {
    const binaryResult: DecodeResult = {
      kind: "binary",
      mediaType: "application/octet-stream",
      wireBytes: 1024,
      rawText: "",
      bytes: new Uint8Array(1024),
    };
    decodeBodyMock.mockResolvedValueOnce(binaryResult);
    render(
      <BodyPane
        title="Response"
        body={makeBody({ contentType: "application/octet-stream" })}
      />,
    );
    // Wait for decode to resolve and both buttons to appear
    await screen.findByText(/binary data/i);
    const downloadBtns = await screen.findAllByRole("button", {
      name: /download/i,
    });
    // Header download button + prominent binary-state download button
    expect(downloadBtns.length).toBeGreaterThanOrEqual(2);
  });
});

describe("BodyPane view modes (PRO-336)", () => {
  beforeEach(() => {
    decodeBodyMock.mockReset();
  });

  const text = '{"hello":"world"}';
  const jsonResult: DecodeResult = {
    kind: "json",
    text: '{\n  "hello": "world"\n}',
    parsed: { hello: "world" },
    mediaType: "application/json",
    wireBytes: text.length,
    rawText: text,
    bytes: new TextEncoder().encode(text),
  };

  it("parsed mode renders the JSON tree viewer for JSON bodies", async () => {
    decodeBodyMock.mockResolvedValueOnce(jsonResult);
    render(<BodyPane title="Response" body={makeBody()} viewMode="parsed" />);
    const viewer = await screen.findByLabelText("JSON viewer");
    expect(viewer).toBeInTheDocument();
    // JsonTreeViewer renders tree rows; confirm the parsed value is visible.
    expect(viewer).toHaveTextContent('"hello"');
    expect(screen.queryByLabelText("Raw body viewer")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Hex viewer")).not.toBeInTheDocument();
  });

  it("parsed mode renders the NDJSON document viewer for NDJSON bodies", async () => {
    const ndjsonResult: DecodeResult = {
      kind: "ndjson",
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
        viewMode="parsed"
      />,
    );
    const viewer = await screen.findByLabelText("NDJSON viewer");
    expect(viewer).toBeInTheDocument();
    // Each NDJSON document renders as its own collapsed tree (one count badge
    // per document, numbered in the gutter).
    expect(viewer.textContent).toContain("1 key");
    expect(viewer.textContent).toContain("1");
    expect(viewer.textContent).toContain("2");
  });

  it("raw mode renders the decoded text, not the pretty JSON", async () => {
    decodeBodyMock.mockResolvedValueOnce(jsonResult);
    render(<BodyPane title="Response" body={makeBody()} viewMode="raw" />);
    const raw = await screen.findByLabelText("Raw body viewer");
    // The un-pretty original source, on a single line.
    expect(raw).toHaveTextContent('{"hello":"world"}');
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
});
