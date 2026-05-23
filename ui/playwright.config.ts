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

export default defineConfig({
  testDir: "./browser",
  timeout: 30_000,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["html", { open: "never" }], ["github"]] : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: {
    command: `pnpm dev --port ${port}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
