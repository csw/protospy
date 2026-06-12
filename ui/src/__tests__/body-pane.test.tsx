import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { render } from "@ui/test/render";
import { BodyPane } from "@ui/components/body-pane";
import type { BodyState } from "@ui/state/reducer";

const jsonBody: BodyState = {
  chunks: [{ text: '{"hello":"world"}' }],
  atEnd: true,
  wireBytes: 17,
  contentType: "application/json",
};

describe("BodyPane — view modes", () => {
  it("parsed mode renders the smart JSON viewer", async () => {
    render(<BodyPane title="Response" body={jsonBody} viewMode="parsed" />);
    expect(await screen.findByLabelText("JSON viewer")).toBeInTheDocument();
    expect(screen.queryByLabelText("Raw body viewer")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Hex viewer")).not.toBeInTheDocument();
  });

  it("raw mode renders the decoded text, not the pretty JSON", async () => {
    render(<BodyPane title="Response" body={jsonBody} viewMode="raw" />);
    const raw = await screen.findByLabelText("Raw body viewer");
    // The un-pretty original source, on a single line.
    expect(raw).toHaveTextContent('{"hello":"world"}');
    expect(screen.queryByLabelText("JSON viewer")).not.toBeInTheDocument();
  });

  it("hex mode renders a hex + ASCII dump of the bytes", async () => {
    render(<BodyPane title="Response" body={jsonBody} viewMode="hex" />);
    const hex = await screen.findByLabelText("Hex viewer");
    // '{' is 0x7b, the first byte of the JSON.
    expect(hex).toHaveTextContent("7b");
    expect(screen.queryByLabelText("JSON viewer")).not.toBeInTheDocument();
  });
});
