import { describe, it, expect } from "vitest";
import {
  computeBodySplitPercent,
  isTextMode,
  maxLineLength,
  BODY_SPLIT_MIN_PCT,
} from "@ui/body/split-sizing";
import type { BodyState } from "@ui/state/reducer";

function makeTextBody(text: string): BodyState {
  return {
    chunks: [{ text }],
    atEnd: true,
    wireBytes: text.length,
    contentType: "text/plain",
  };
}

function makeBody(text: string, contentType = "application/json"): BodyState {
  return {
    chunks: [{ text }],
    atEnd: true,
    wireBytes: text.length,
    contentType,
  };
}

describe("isTextMode", () => {
  it("returns true when viewMode is explicitly text", () => {
    expect(isTextMode(undefined, "text")).toBe(true);
    expect(isTextMode(makeTextBody("hello"), "text")).toBe(true);
  });

  it("returns false when viewMode is explicitly non-text", () => {
    expect(isTextMode(makeTextBody("hello"), "tree")).toBe(false);
    expect(isTextMode(makeTextBody("hello"), "hex")).toBe(false);
    expect(isTextMode(makeTextBody("hello"), "formatted")).toBe(false);
    expect(isTextMode(makeTextBody("hello"), "summary")).toBe(false);
  });

  it("returns false when viewMode is null and body is undefined", () => {
    expect(isTextMode(undefined, null)).toBe(false);
  });

  it("returns true for plain text content types with null viewMode", () => {
    expect(isTextMode(makeBody("hi", "text/plain"), null)).toBe(true);
    expect(isTextMode(makeBody("hi", "text/csv"), null)).toBe(true);
    expect(isTextMode(makeBody("hi", "text/plain; charset=utf-8"), null)).toBe(
      true,
    );
  });

  it("returns false for excluded text subtypes", () => {
    expect(isTextMode(makeBody("hi", "text/event-stream"), null)).toBe(false);
    expect(isTextMode(makeBody("hi", "text/html"), null)).toBe(false);
    expect(isTextMode(makeBody("hi", "text/xml"), null)).toBe(false);
  });

  it("returns false for non-text content types with null viewMode", () => {
    expect(isTextMode(makeBody("{}", "application/json"), null)).toBe(false);
    expect(isTextMode(makeBody("data", "application/octet-stream"), null)).toBe(
      false,
    );
    expect(isTextMode(makeBody("<html/>", "text/html"), null)).toBe(false);
  });
});

describe("maxLineLength", () => {
  it("returns 0 for undefined body", () => {
    expect(maxLineLength(undefined, 4096)).toBe(0);
  });

  it("measures the longest line in single-chunk text", () => {
    const body = makeTextBody("short\nlonger line here\nmed");
    expect(maxLineLength(body, 4096)).toBe("longer line here".length);
  });

  it("measures across chunks", () => {
    const body: BodyState = {
      chunks: [{ text: "abc\nde" }, { text: "fgh\nij" }],
      atEnd: true,
      wireBytes: 12,
      contentType: "text/plain",
    };
    // "defgh" spans two chunks → length 5
    expect(maxLineLength(body, 4096)).toBe(5);
  });

  it("respects the byte limit", () => {
    // Only scan first 5 bytes: "abcde" (no newline) → max = 5
    const body = makeTextBody("abcde\nthis-long-line-should-not-count");
    expect(maxLineLength(body, 5)).toBe(5);
  });

  it("handles no-newline bodies (one long line)", () => {
    const body = makeTextBody("hello world");
    expect(maxLineLength(body, 4096)).toBe(11);
  });

  it("skips binary chunks", () => {
    const body: BodyState = {
      chunks: [{ binary: btoa("hello\nworld") }, { text: "abc" }],
      atEnd: true,
      wireBytes: 15,
      contentType: "application/octet-stream",
    };
    expect(maxLineLength(body, 4096)).toBe(3);
  });
});

describe("computeBodySplitPercent", () => {
  it("returns 50 when neither side is in text mode", () => {
    const req = makeBody('{"key":"val"}', "application/json");
    const res = makeBody('{"result":1}', "application/json");
    expect(computeBodySplitPercent(req, res, null, null)).toBe(50);
    expect(computeBodySplitPercent(req, res, "tree", "tree")).toBe(50);
    expect(computeBodySplitPercent(req, res, "hex", "hex")).toBe(50);
  });

  it("returns 50 when both bodies are absent in text mode", () => {
    const body = makeTextBody("x");
    expect(computeBodySplitPercent(undefined, undefined, "text", "text")).toBe(
      50,
    );
    // Empty wireBytes
    const empty: BodyState = { ...body, wireBytes: 0 };
    expect(computeBodySplitPercent(empty, empty, "text", "text")).toBe(50);
  });

  it("collapses the absent side to the minimum", () => {
    const body = makeTextBody("hello world");
    expect(computeBodySplitPercent(undefined, body, "text", "text")).toBe(
      BODY_SPLIT_MIN_PCT,
    );
    expect(computeBodySplitPercent(body, undefined, "text", "text")).toBe(
      100 - BODY_SPLIT_MIN_PCT,
    );
  });

  it("gives the trivially small side 25% and the real side 75%", () => {
    const small = makeTextBody("{}"); // < 100 bytes
    const real = makeTextBody("x".repeat(200)); // > 100 bytes
    expect(computeBodySplitPercent(small, real, "text", "text")).toBe(25);
    expect(computeBodySplitPercent(real, small, "text", "text")).toBe(75);
  });

  it("stays at 50 when line lengths are similar", () => {
    const req = makeTextBody("short\nshort\nshort");
    const res = makeTextBody("shrt\nshrt\nshrt");
    expect(computeBodySplitPercent(req, res, "text", "text")).toBe(50);
  });

  it("skews toward the side with significantly longer lines", () => {
    const narrow = makeTextBody("ab\ncd\nef");
    const wide = makeTextBody("a".repeat(120) + "\n" + "b".repeat(120) + "\n");
    const pct = computeBodySplitPercent(narrow, wide, "text", "text");
    // Response has much longer lines → request pane should be small
    expect(pct).toBeLessThan(40);
    expect(pct).toBeGreaterThanOrEqual(BODY_SPLIT_MIN_PCT);
  });

  it("applies the heuristic when only one side is text mode", () => {
    const empty = undefined;
    const text = makeTextBody("hello world");
    // Request is text (via explicit viewMode), response absent
    expect(computeBodySplitPercent(text, empty, "text", "text")).toBe(
      100 - BODY_SPLIT_MIN_PCT,
    );
  });

  it("returns 50 when neither side is text even with explicit hex mode", () => {
    const req = makeBody("data", "application/octet-stream");
    const res = makeBody("data", "application/octet-stream");
    expect(computeBodySplitPercent(req, res, "hex", "hex")).toBe(50);
  });

  it("clamps result within [BODY_SPLIT_MIN_PCT, 100 - BODY_SPLIT_MIN_PCT]", () => {
    // Extreme case: request has nothing, response has lots in text mode
    const real = makeTextBody("x".repeat(500));
    const pct = computeBodySplitPercent(undefined, real, "text", "text");
    expect(pct).toBeGreaterThanOrEqual(BODY_SPLIT_MIN_PCT);
    expect(pct).toBeLessThanOrEqual(100 - BODY_SPLIT_MIN_PCT);
  });
});
