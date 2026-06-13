import { describe, it, expect } from "vitest";
import { render, act } from "@testing-library/react";
import { JsonFlatView } from "@ui/components/json-viewer";

async function renderAndSettle(ui: React.ReactElement) {
  const result = render(ui);
  await act(async () => {});
  return result;
}

describe("JsonFlatView", () => {
  it("renders JSON text lines in the viewer", async () => {
    const text = '{\n  "a": 1\n}';
    const { container } = await renderAndSettle(<JsonFlatView text={text} />);
    const viewer = container.querySelector('[aria-label="JSON viewer"]')!;
    expect(viewer).toBeTruthy();
    expect(viewer.textContent).toContain('"a"');
    expect(viewer.textContent).toContain("1");
  });

  it("renders multiple JSONL objects separated by blank lines", async () => {
    const text = '{\n  "a": 1\n}\n\n{\n  "b": 2\n}';
    const { container } = await renderAndSettle(<JsonFlatView text={text} />);
    const viewer = container.querySelector('[aria-label="JSON viewer"]')!;
    expect(viewer.textContent).toContain('"a"');
    expect(viewer.textContent).toContain('"b"');
  });

  it("applies syntax highlighting classes", async () => {
    const text = '{\n  "key": "value",\n  "num": 42,\n  "flag": true\n}';
    const { container } = await renderAndSettle(<JsonFlatView text={text} />);
    expect(container.querySelector(".text-json-key")).toBeTruthy();
    expect(container.querySelector(".text-json-string")).toBeTruthy();
    expect(container.querySelector(".text-json-number")).toBeTruthy();
    expect(container.querySelector(".text-json-boolean")).toBeTruthy();
    expect(container.querySelector(".text-json-punct")).toBeTruthy();
  });

  it("renders line numbers starting at 1", async () => {
    const text = '{\n  "x": 1\n}';
    const { container } = await renderAndSettle(<JsonFlatView text={text} />);
    // Line number spans are select-none and use text-json-lineno
    const lineNos = container.querySelectorAll(".text-json-lineno");
    expect(lineNos.length).toBeGreaterThan(0);
    expect(lineNos[0].textContent).toBe("1");
  });
});
