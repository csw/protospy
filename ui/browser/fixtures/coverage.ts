import { test as base, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";

// Istanbul browser-test coverage collection (PRO-437).
//
// When COVERAGE=true the preview build is Istanbul-instrumented (see
// vite.config.ts), so each page exposes `window.__coverage__`. This fixture
// overrides the `context` fixture to drain that object to `.nyc_output/` — one
// JSON file per browser context — which `nyc report` then merges. Coverage is
// flushed both on `beforeunload` (so navigations/reloads don't lose it) and
// once more when the context tears down. Every spec imports `test`/`expect`
// from here instead of `@playwright/test` so the whole suite is captured.
//
// When COVERAGE is unset this is a transparent re-export of the base test —
// no init scripts, no exposed functions, no output. Off by default.

const COVERAGE = process.env.COVERAGE === "true";
const outputDir = path.resolve(process.cwd(), ".nyc_output");

const collectingTest = base.extend({
  context: async ({ context }, use) => {
    // Flush coverage on page unload so it survives reloads and cross-document
    // navigations, which would otherwise discard the in-page accumulator.
    await context.addInitScript(() =>
      window.addEventListener("beforeunload", () => {
        const w = window as typeof window & {
          collectIstanbulCoverage?: (json: string) => void;
          __coverage__?: unknown;
        };
        w.collectIstanbulCoverage?.(JSON.stringify(w.__coverage__));
      }),
    );

    await mkdir(outputDir, { recursive: true });
    await context.exposeFunction(
      "collectIstanbulCoverage",
      async (coverageJSON: string) => {
        // Pages with no instrumented modules executed report `undefined`,
        // which stringifies to "undefined" — skip those.
        if (coverageJSON && coverageJSON !== "undefined") {
          await writeFile(
            path.join(outputDir, `playwright_coverage_${randomUUID()}.json`),
            coverageJSON,
          );
        }
      },
    );

    // `use` is Playwright's fixture provider, not React's `use` hook.
    // eslint-disable-next-line react-hooks/rules-of-hooks
    await use(context);

    // Final flush for any pages still open at context teardown (the common
    // case — most specs never trigger `beforeunload`).
    for (const page of context.pages()) {
      await page.evaluate(() => {
        const w = window as typeof window & {
          collectIstanbulCoverage?: (json: string) => void;
          __coverage__?: unknown;
        };
        w.collectIstanbulCoverage?.(JSON.stringify(w.__coverage__));
      });
    }
  },
});

export const test = COVERAGE ? collectingTest : base;
export { expect };
export type { Page, TestInfo } from "@playwright/test";
