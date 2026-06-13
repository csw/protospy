import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import {
  JsonTreeHarness,
  parseJsonInput,
} from "@ui/components/json-tree/harness";

async function renderAndSettle(ui: React.ReactElement) {
  const result = render(ui);
  await act(async () => {});
  return result;
}

describe("parseJsonInput", () => {
  it("treats blank or whitespace-only input as empty", () => {
    expect(parseJsonInput("")).toEqual({ status: "empty" });
    expect(parseJsonInput("   \n\t ")).toEqual({ status: "empty" });
  });

  it("parses valid JSON into a value", () => {
    expect(parseJsonInput('{"a":1,"b":[2,3]}')).toEqual({
      status: "ok",
      value: { a: 1, b: [2, 3] },
    });
    expect(parseJsonInput("42")).toEqual({ status: "ok", value: 42 });
  });

  it("reports a message for invalid JSON", () => {
    const result = parseJsonInput("{not json}");
    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.message).toBeTruthy();
    }
  });
});

describe("JsonTreeHarness custom input", () => {
  const openCustom = () => fireEvent.click(screen.getByTestId("source-custom"));

  it("shows a prompt before any input is entered", async () => {
    await renderAndSettle(<JsonTreeHarness />);
    openCustom();
    expect(screen.getByTestId("json-tree-harness-viewport")).toHaveTextContent(
      /Paste JSON or load a file/i,
    );
  });

  it("renders pasted JSON in the viewer", async () => {
    const { container } = await renderAndSettle(<JsonTreeHarness />);
    openCustom();
    await act(async () => {
      fireEvent.change(screen.getByTestId("custom-input"), {
        target: { value: '{"hello":"world"}' },
      });
    });
    const viewer = container.querySelector('[aria-label="JSON tree viewer"]')!;
    expect(viewer).toHaveTextContent('"hello"');
    expect(viewer).toHaveTextContent('"world"');
  });

  it("surfaces a parse error for invalid JSON and hides the viewer", async () => {
    const { container } = await renderAndSettle(<JsonTreeHarness />);
    openCustom();
    await act(async () => {
      fireEvent.change(screen.getByTestId("custom-input"), {
        target: { value: "{broken" },
      });
    });
    expect(screen.getByTestId("custom-error")).toHaveTextContent(
      /Invalid JSON/,
    );
    expect(
      container.querySelector('[aria-label="JSON tree viewer"]'),
    ).toBeNull();
  });

  it("loads JSON from a selected file", async () => {
    const { container } = await renderAndSettle(<JsonTreeHarness />);
    openCustom();
    const file = new File(['{"fromFile":true}'], "data.json", {
      type: "application/json",
    });
    await act(async () => {
      fireEvent.change(screen.getByTestId("custom-file"), {
        target: { files: [file] },
      });
    });
    await act(async () => {});
    const viewer = container.querySelector('[aria-label="JSON tree viewer"]')!;
    expect(viewer).toHaveTextContent('"fromFile"');
    expect(screen.getByText("data.json")).toBeInTheDocument();
  });

  it("clears the pasted input back to the prompt", async () => {
    await renderAndSettle(<JsonTreeHarness />);
    openCustom();
    await act(async () => {
      fireEvent.change(screen.getByTestId("custom-input"), {
        target: { value: '{"a":1}' },
      });
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("custom-clear"));
    });
    expect(screen.getByTestId("custom-input")).toHaveValue("");
    expect(screen.getByTestId("json-tree-harness-viewport")).toHaveTextContent(
      /Paste JSON or load a file/i,
    );
  });
});
