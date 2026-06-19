import { describe, it, expect } from "vitest";
import {
  computeBodySplitPercent,
  BODY_SPLIT_MIN_PCT,
} from "@ui/body/split-sizing";
import type { BodyState } from "@ui/state/reducer";

function makeBody(text: string, contentType = "application/json"): BodyState {
  return {
    chunks: [{ text }],
    atEnd: true,
    wireBytes: text.length,
    contentType,
  };
}

describe("computeBodySplitPercent", () => {
  it("collapses the request pane to the minimum when there is no request body", () => {
    expect(computeBodySplitPercent(undefined)).toBe(BODY_SPLIT_MIN_PCT);
  });

  it("splits 50/50 when a request body is present", () => {
    expect(computeBodySplitPercent(makeBody('{"key":"val"}'))).toBe(50);
  });

  it("splits 50/50 regardless of request body size", () => {
    // The size of the body does not change the initial split — only its
    // presence does (PRO-432). A trivially small body still yields 50/50.
    expect(computeBodySplitPercent(makeBody("{}"))).toBe(50);
    expect(computeBodySplitPercent(makeBody("x".repeat(5000)))).toBe(50);
  });

  it("splits 50/50 even for a body that has not streamed any chunks yet", () => {
    // The reducer records a non-undefined requestBody as soon as the Request
    // event arrives (NotRead → empty chunks, wireBytes 0). Presence alone
    // drives the split, so this does not race against streaming data.
    const notRead: BodyState = {
      chunks: [],
      atEnd: false,
      wireBytes: 0,
      contentType: "application/json",
    };
    expect(computeBodySplitPercent(notRead)).toBe(50);
  });
});
