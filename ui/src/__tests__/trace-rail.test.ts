import { describe, expect, it } from "vitest";
import { packLanes, traceRailWidth } from "@ui/components/trace-rail";

describe("TraceRail lane packing", () => {
  it("packs overlapping multi-member traces into separate lanes", () => {
    const packed = packLanes(["a", "b", "a", "b", "solo"]);

    expect(packed.laneCount).toBe(2);
    expect(packed.intervals).toEqual([
      { traceId: "a", first: 0, last: 2, count: 2, lane: 0 },
      { traceId: "b", first: 1, last: 3, count: 2, lane: 1 },
    ]);
  });

  it("ignores single-member traces and reuses lanes after intervals end", () => {
    const packed = packLanes(["a", "a", "solo", "b", null, "b"]);

    expect(packed.laneCount).toBe(1);
    expect(packed.intervals).toEqual([
      { traceId: "a", first: 0, last: 1, count: 2, lane: 0 },
      { traceId: "b", first: 3, last: 5, count: 2, lane: 0 },
    ]);
  });

  it("computes the reserved rail width from the lane count", () => {
    expect(traceRailWidth(0)).toBe(9);
    expect(traceRailWidth(1)).toBe(12);
    expect(traceRailWidth(2)).toBe(18);
  });
});
