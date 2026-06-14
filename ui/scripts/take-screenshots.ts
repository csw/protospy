/**
 * take-screenshots.ts
 *
 * Orchestrates the full pipeline for `just screenshots`:
 *   1. Start a minimal mock HTTP target server
 *   2. Start the protospy binary
 *   3. Start the Vite dev server (screenshots config)
 *   4. Wait for all services to be ready
 *   5. Send example requests through the proxy
 *   6. Capture 3 dark-mode screenshots at 1280×720
 *   7. Tear down all child processes
 *
 * Run via: tsx scripts/take-screenshots.ts (from ui/)
 * Or:      pnpm run screenshots
 */

import { chromium } from "@playwright/test";
import type { Browser, BrowserContext, Page } from "@playwright/test";
import { execFileSync, spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import * as http from "node:http";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

// ─── Paths ────────────────────────────────────────────────────────────────────

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const UI_DIR = path.resolve(__dirname, "..");
const ROOT = path.resolve(__dirname, "../..");

// Use `cargo metadata` to locate the actual target directory. This correctly
// handles git worktrees, where Cargo's target/ lives in the main workspace
// rather than in the worktree root.
interface CargoMeta {
  target_directory: string;
}
const cargoMeta = JSON.parse(
  execFileSync("cargo", ["metadata", "--format-version", "1", "--no-deps"], {
    cwd: ROOT,
    encoding: "utf8",
  }),
) as CargoMeta;

const PROTOSPY_BIN = path.join(cargoMeta.target_directory, "debug", "protospy");
const SCREENSHOTS_DIR = path.join(ROOT, "docs", "screenshots");
const VITE_BIN = path.join(UI_DIR, "node_modules", ".bin", "vite");
const VITE_CONFIG = path.join(UI_DIR, "scripts", "vite.screenshots.config.ts");

// ─── Ports ────────────────────────────────────────────────────────────────────
// All in the 6220–6223 range to avoid collisions with a running dev env.

const MOCK_TARGET_PORT = 6220;
const PROTOSPY_WEB_PORT = 6221;
const PROXY_PORT = 6222;
const UI_PORT = 6223;

// ─── Process lifecycle ────────────────────────────────────────────────────────

const childPids: number[] = [];
let mockServer: http.Server | null = null;
let browser: Browser | null = null;

function spawnDetached(
  cmd: string,
  args: string[],
  opts: { cwd?: string; env?: NodeJS.ProcessEnv } = {},
): ChildProcess {
  const child = spawn(cmd, args, {
    ...opts,
    detached: true,
    stdio: "pipe",
  });
  if (child.pid == null) throw new Error(`Failed to spawn: ${cmd}`);
  childPids.push(child.pid);
  // Drain stdout; mirror stderr so startup errors are visible.
  child.stdout?.resume();
  child.stderr?.on("data", (d: Buffer) => process.stderr.write(d));
  return child;
}

async function cleanup(): Promise<void> {
  await browser?.close().catch(() => undefined);
  browser = null;

  for (const pid of childPids) {
    try {
      process.kill(-pid, "SIGTERM");
    } catch {
      // Process already gone — that's fine.
    }
  }

  await sleep(800);

  for (const pid of childPids) {
    try {
      process.kill(-pid, "SIGKILL");
    } catch {
      // Already gone.
    }
  }

  await new Promise<void>((resolve) => {
    if (mockServer == null) {
      resolve();
      return;
    }
    mockServer.close(() => resolve());
  });
}

// ─── Mock HTTP target ─────────────────────────────────────────────────────────

// Both response bodies are loaded from docs/examples/ at startup and passed in here.
// simpleResponseBody is used for the initial exchange-list population requests;
// richResponseBody is returned when the POST body is non-trivial (not "{}"), so the
// inspector body screenshot has something interesting to show.
function startMockServer(
  simpleResponseBody: string,
  richResponseBody: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    mockServer = http.createServer((req, res) => {
      res.setHeader("content-type", "application/json");

      if (req.method === "GET" && req.url === "/") {
        res.end(
          JSON.stringify({
            name: "protospy-dev",
            cluster_name: "docker-cluster",
            tagline: "You Know, for Search",
          }),
        );
      } else if (req.method === "POST" && req.url === "/movies/_search") {
        // Buffer the request body so we can decide which response to send
        let body = "";
        req.on("data", (chunk: Buffer) => {
          body += chunk.toString();
        });
        req.on("end", () => {
          res.end(body.trim() === "{}" ? simpleResponseBody : richResponseBody);
        });
      } else {
        res.end("{}");
      }
    });

    mockServer.on("error", reject);
    mockServer.listen(MOCK_TARGET_PORT, "127.0.0.1", resolve);
  });
}

// ─── Readiness polling ────────────────────────────────────────────────────────

async function waitReady(url: string, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastErr: unknown;

  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2_000) });
      if (res.ok) return;
    } catch (err) {
      lastErr = err;
    }
    await sleep(500);
  }

  throw new Error(`Timed out waiting for ${url}: ${lastErr}`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  await mkdir(SCREENSHOTS_DIR, { recursive: true });

  // Read example payloads from docs/examples/
  const simpleResponseBody = await readFile(
    path.join(ROOT, "docs", "examples", "movies-simple-response.json"),
    "utf8",
  );
  const richRequestBody = await readFile(
    path.join(ROOT, "docs", "examples", "movies-search-request.json"),
    "utf8",
  );
  const richResponseBody = await readFile(
    path.join(ROOT, "docs", "examples", "movies-search-response.json"),
    "utf8",
  );

  // 1. Mock target server
  await startMockServer(simpleResponseBody, richResponseBody);
  console.log(`✓ Mock target listening on :${MOCK_TARGET_PORT}`);

  // 2. Protospy binary (run directly, not via cargo run — avoids signal-swallowing)
  //    LISTEN_PORT: protospy's management API + SSE endpoint (WEB is a bool, not a port)
  spawnDetached(PROTOSPY_BIN, [], {
    env: {
      ...process.env,
      PROXY__ES__PORT: String(PROXY_PORT),
      PROXY__ES__TARGET: `http://localhost:${MOCK_TARGET_PORT}/`,
      PROXY__ES__PROTOCOL: "Elasticsearch",
      LISTEN_PORT: String(PROTOSPY_WEB_PORT),
      RUST_LOG: "warn",
    },
  });
  console.log(
    `✓ Protospy started (proxy :${PROXY_PORT}, web :${PROTOSPY_WEB_PORT})`,
  );

  // 3. Vite dev server (screenshots-specific config)
  //    Call the bin wrapper directly (not via `node`; it's a shell script with a shebang)
  spawnDetached(
    VITE_BIN,
    ["--config", VITE_CONFIG, "--port", String(UI_PORT)],
    {
      cwd: UI_DIR,
    },
  );
  console.log(`✓ Vite dev server starting on :${UI_PORT}`);

  // 4. Wait for all services
  await Promise.all([
    waitReady(`http://localhost:${PROTOSPY_WEB_PORT}/info`).then(() =>
      console.log("  protospy ready"),
    ),
    waitReady(`http://localhost:${UI_PORT}/`).then(() =>
      console.log("  vite ready"),
    ),
  ]);
  console.log("✓ All services ready");

  // 5. Navigate to the UI first so the SSE subscription is established before
  //    we send requests. Protospy does not replay past events to late subscribers.
  browser = await chromium.launch({ headless: true });
  const ctx: BrowserContext = await browser.newContext({
    viewport: { width: 1280, height: 720 },
  });
  const page: Page = await ctx.newPage();
  await page.goto(`http://localhost:${UI_PORT}/`);

  // Wait for Zustand persist hydration (store is exposed on window.__test_store).
  // Use ?? true to match inject.ts: if persist isn't present, assume ready.
  await page.waitForFunction(
    () =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__test_store?.persist?.hasHydrated?.() ?? true,
    undefined, // no arg — pass explicit undefined so options is unambiguous
    { timeout: 10_000 },
  );

  // Force dark mode via the next-themes bridge (window.__test_theme.setTheme).
  // Theme moved out of the Zustand store with the v2.3 next-themes swap.
  await page.waitForFunction(
    () => !!(window as any).__test_theme?.setTheme, // eslint-disable-line @typescript-eslint/no-explicit-any
    undefined,
    { timeout: 10_000 },
  );
  await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__test_theme.setTheme("dark");
  });
  // Wait for the .dark class to land on <html>
  await page.waitForFunction(
    () => document.documentElement.classList.contains("dark"),
    undefined,
    { timeout: 5_000 },
  );

  // Brief pause to let the SSE useEffect connect before traffic arrives
  await sleep(500);

  // 6. Send example requests through the proxy
  //    GET / × 2, POST /movies/_search × 3
  for (let i = 0; i < 2; i++) {
    await fetch(`http://localhost:${PROXY_PORT}/`);
  }
  for (let i = 0; i < 3; i++) {
    await fetch(`http://localhost:${PROXY_PORT}/movies/_search`, {
      method: "POST",
      body: "{}",
      headers: { "content-type": "application/json" },
    });
  }
  console.log("✓ Example requests sent through proxy");

  // Wait for all 5 exchanges to arrive via SSE
  await page.waitForFunction(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    () => ((window as any).__test_store?.getState().ids?.length ?? 0) >= 5,
    undefined, // no arg
    { timeout: 20_000 },
  );
  console.log("✓ Exchanges visible in UI");

  // ── Screenshot 1: exchange list ──────────────────────────────────────────

  const screenshot1 = path.join(SCREENSHOTS_DIR, "01-exchange-list.png");
  await page.screenshot({ path: screenshot1 });
  console.log(`✓ Saved: ${screenshot1}`);

  // ── Screenshot 2: inspector panel ────────────────────────────────────────

  // Click the first exchange in the listbox to open the inspector
  await page.getByRole("option").first().click();
  // Wait for the inspector tab panel to appear
  await page
    .getByRole("tabpanel")
    .waitFor({ state: "visible", timeout: 8_000 });

  const screenshot2 = path.join(SCREENSHOTS_DIR, "02-inspector.png");
  await page.screenshot({ path: screenshot2 });
  console.log(`✓ Saved: ${screenshot2}`);

  // ── Screenshot 3: inspector with a non-trivial request/response body ─────

  // Send the rich request from docs/examples/. The mock server returns the rich
  // response when the body is non-trivial (not "{}").
  await fetch(`http://localhost:${PROXY_PORT}/movies/_search`, {
    method: "POST",
    body: richRequestBody,
    headers: { "content-type": "application/json" },
  });

  // Wait for the 6th exchange to arrive
  await page.waitForFunction(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    () => ((window as any).__test_store?.getState().ids?.length ?? 0) >= 6,
    undefined,
    { timeout: 10_000 },
  );

  // The new exchange appears at the top of the list (newest-first order)
  await page.getByRole("option").first().click();
  await page
    .getByRole("tabpanel")
    .waitFor({ state: "visible", timeout: 5_000 });

  const screenshot3 = path.join(SCREENSHOTS_DIR, "03-body.png");
  await page.screenshot({ path: screenshot3 });
  console.log(`✓ Saved: ${screenshot3}`);

  await browser.close();
  browser = null;
}

// ─── Entry point ──────────────────────────────────────────────────────────────

process.on("SIGINT", () => {
  void cleanup().then(() => process.exit(130));
});
process.on("SIGTERM", () => {
  void cleanup().then(() => process.exit(143));
});

main()
  .then(async () => {
    await cleanup();
    console.log("\nDone ✓");
    process.exit(0);
  })
  .catch(async (err: unknown) => {
    console.error("\nScreenshots failed:", err);
    await cleanup();
    process.exit(1);
  });
