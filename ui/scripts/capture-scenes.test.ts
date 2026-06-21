import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  LIGHT_SCENES,
  parseArgs,
  planCells,
  runPool,
  type Cell,
} from "./capture-scenes-lib";

describe("parseArgs", () => {
  it("requires --out", () => {
    expect(() => parseArgs([])).toThrow(/usage/);
  });

  it("parses all flags", () => {
    const args = parseArgs([
      "--out",
      "/tmp/x",
      "--concurrency",
      "3",
      "--port",
      "9999",
      "--base-url",
      "http://localhost:1234",
      "--no-build",
    ]);
    expect(args).toEqual({
      out: "/tmp/x",
      concurrency: 3,
      port: 9999,
      baseUrl: "http://localhost:1234",
      build: false,
    });
  });

  it("applies env-independent defaults", () => {
    const args = parseArgs(["--out", "/tmp/x"]);
    // build/baseUrl don't read env, so they're deterministic.
    expect(args.build).toBe(true);
    expect(args.baseUrl).toBeNull();
    expect(args.concurrency).toBeGreaterThanOrEqual(1);
    expect(Number.isInteger(args.concurrency)).toBe(true);
  });

  it("rejects a non-positive or non-integer --concurrency", () => {
    expect(() => parseArgs(["--out", "x", "--concurrency", "0"])).toThrow(
      /invalid --concurrency/,
    );
    expect(() => parseArgs(["--out", "x", "--concurrency", "1.5"])).toThrow(
      /invalid --concurrency/,
    );
  });

  it("rejects an unknown argument", () => {
    expect(() => parseArgs(["--out", "x", "--bogus"])).toThrow(
      /unknown argument/,
    );
  });
});

describe("planCells", () => {
  const lightIds = [...LIGHT_SCENES];

  it("captures every scene in dark and the light subset in light", () => {
    const sceneIds = [...lightIds, "extra-a", "extra-b"];
    const cells = planCells(sceneIds);

    const dark = cells.filter((c) => c.theme === "dark");
    const light = cells.filter((c) => c.theme === "light");

    expect(dark.map((c) => c.scene)).toEqual(sceneIds); // all, in order
    expect(new Set(light.map((c) => c.scene))).toEqual(LIGHT_SCENES);
    expect(cells.length).toBe(sceneIds.length + LIGHT_SCENES.size);
  });

  it("never emits a light cell for a non-allowlisted scene", () => {
    const cells = planCells(["extra-only", ...lightIds]);
    const lightScenes = cells
      .filter((c) => c.theme === "light")
      .map((c) => c.scene);
    expect(lightScenes).not.toContain("extra-only");
  });

  it("throws if a LIGHT_SCENES id is absent from the live scenes", () => {
    const missingOne = lightIds.slice(1); // drop the first allowlisted id
    expect(() => planCells(missingOne)).toThrow(
      new RegExp(`unknown scene id\\(s\\).*${lightIds[0]}`),
    );
  });
});

describe("runPool", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const cells = (n: number): Cell[] =>
    Array.from({ length: n }, (_, i) => ({ scene: `s${i}`, theme: "dark" }));

  it("runs the worker exactly once per cell", async () => {
    const seen: string[] = [];
    await runPool(cells(5), 2, async (c) => {
      seen.push(c.scene);
      return `${c.scene}.png`;
    });
    expect(seen.sort()).toEqual(["s0", "s1", "s2", "s3", "s4"]);
  });

  it("never exceeds the concurrency cap", async () => {
    let active = 0;
    let maxActive = 0;
    await runPool(cells(12), 3, async (c) => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
      return `${c.scene}.png`;
    });
    expect(maxActive).toBeLessThanOrEqual(3);
  });

  it("handles concurrency greater than the cell count", async () => {
    let count = 0;
    await runPool(cells(2), 8, async (c) => {
      count++;
      return `${c.scene}.png`;
    });
    expect(count).toBe(2);
  });
});
