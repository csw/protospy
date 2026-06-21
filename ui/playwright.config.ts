import { defineConfig } from "@playwright/test";
import { createHash } from "crypto";
import { fileURLToPath } from "url";

// Derive a stable port from this file's path so all Playwright processes
// (main + workers) agree on the same value. Different worktrees produce
// different ports because their paths differ, preventing collisions between
// concurrent agent runs.
const __dirname = fileURLToPath(new URL(".", import.meta.url));
const hash = createHash("sha256").update(__dirname).digest();
const port = 49152 + (hash.readUInt16BE(0) % 16383);
const baseURL = `http://localhost:${port}`;

// Opt-in Istanbul coverage (PRO-437): `test:browser:coverage` sets COVERAGE=true.
// Coverage runs against the instrumented Vite *dev server* rather than the preview
// build — this is the standard vite-plugin-istanbul setup. It instruments each
// module in serve mode before oxc compiles JSX, so the `{cond && <X/>}` branches
// inside component returns get real counters (a `vite build` compiles JSX away
// before the plugin's `enforce:"post"` pass, dropping them; see vite.config.ts).
// The dev server also exposes the __test_store / __test_scenes harness hooks via
// `import.meta.env.DEV`, so no test-mode build is needed. The coverage fixture
// (browser/fixtures/coverage.ts) drains `window.__coverage__` to `.nyc_output/`.
const coverage = process.env.COVERAGE === "true";

export default defineConfig({
  testDir: "./browser",
  timeout: 30_000,
  // A retry locally too (CI keeps 2) to self-heal the occasional transient
  // server stall under concurrent cold page loads.
  retries: process.env.CI ? 2 : 1,
  workers: 2,
  reporter: process.env.CI ? [["html", { open: "never" }], ["github"]] : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: {
    // Serve a real (test-mode) build via `vite preview` rather than the Vite
    // dev server. The dev server transforms modules on demand and serializes
    // concurrent cold page loads through a single thread, which stalls
    // beforeEach `page.goto` under parallel workers. A static preview build has
    // no such bottleneck. `build:test` keeps the `__test_store` / `__test_scenes`
    // harness hooks (gated off in a plain production build) via
    // VITE_EXPOSE_TEST_HOOKS.
    command: coverage
      ? `pnpm dev --port ${port} --strictPort`
      : `pnpm build:test && pnpm preview --port ${port} --strictPort`,
    env: coverage ? { COVERAGE: "true" } : undefined,
    url: baseURL,
    reuseExistingServer: !process.env.CI && !coverage,
    // `pnpm build:test` runs before the server is up, so allow extra headroom
    // over the default 60s for the cold build.
    timeout: 120_000,
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
