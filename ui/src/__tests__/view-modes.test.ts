import { describe, it, expect } from "vitest";
import { defaultMode, resolveMode, selectableModes } from "@ui/body/view-modes";

describe("selectableModes", () => {
  it("includes text only when the text predicate is satisfied", () => {
    expect(selectableModes("json", true)).toEqual(["tree", "text", "hex"]);
    expect(selectableModes("json", false)).toEqual(["tree", "hex"]);
    expect(selectableModes("html", true)).toEqual(["formatted", "text", "hex"]);
    expect(selectableModes("html", false)).toEqual(["formatted", "hex"]);
  });

  it("offers rendered/hex for images and text/hex for text", () => {
    expect(selectableModes("image", false)).toEqual(["rendered", "hex"]);
    expect(selectableModes("text", true)).toEqual(["text", "hex"]);
  });

  it("offers only hex for binary (summary is implicit)", () => {
    expect(selectableModes("binary", false)).toEqual(["hex"]);
  });
});

describe("defaultMode", () => {
  it("picks the lowest-precedence mode per kind", () => {
    expect(defaultMode("json", true)).toBe("tree");
    expect(defaultMode("ndjson", true)).toBe("tree");
    expect(defaultMode("html", true)).toBe("formatted");
    expect(defaultMode("xml", true)).toBe("formatted");
    expect(defaultMode("image", false)).toBe("rendered");
    expect(defaultMode("text", true)).toBe("text");
    expect(defaultMode("binary", false)).toBe("summary");
  });
});

describe("resolveMode", () => {
  it("returns the default when no mode is stored", () => {
    expect(resolveMode(null, "json", true)).toBe("tree");
  });

  it("honors a stored mode that is available", () => {
    expect(resolveMode("text", "json", true)).toBe("text");
    expect(resolveMode("hex", "image", false)).toBe("hex");
  });

  it("falls back to the default when the stored mode is unavailable", () => {
    // tree carried onto an image body — not selectable, fall back.
    expect(resolveMode("tree", "image", false)).toBe("rendered");
    // text stored, but text unavailable for this JSON body.
    expect(resolveMode("text", "json", false)).toBe("tree");
  });
});
