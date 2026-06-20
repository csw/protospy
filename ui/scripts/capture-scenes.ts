/**
 * capture-scenes.ts
 *
 * Canonical visual-regression capture for reg-suit. Renders the fixture matrix
 * to PNGs through the SAME engine the CI browser suite uses — the pinned
 * `@playwright/test` Chromium against the static `preview` build — so a baseline
 * captured in CI and a PR's "after" captured in CI diff cleanly, pixel for
 * pixel. (The `playwright-cli` daemon used for ad-hoc QA does not exist in CI
 * and drives `pnpm dev`, a different renderer — it is deliberately not used
 * here.)
 *
 * The fixture matrix stubs `/info` and injects store state via the dev/test
 * `window.__test_scenes` harness, so NO protospy backend (and no cargo build) is
 * needed — only the built UI. Scenes are enumerated from the live harness
 * (`window.__test_scenes.list()`), not a hand-authored spec, so the captured set
 * is exactly the matrix.
 *
 * Matrix: every scene at 1280×dark, plus a curated `LIGHT_SCENES` subset at
 * 1280×light (the surfaces whose light treatment matters). Output filenames are
 * the canonical `{scene}-1280-{theme}.png`.
 *
 * Capture runs as a bounded concurrency pool of BrowserContexts — safe because
 * the static `preview` server handles concurrent cold loads (the dev server
 * serializes them; see playwright.config.ts).
 *
 * Run via: pnpm capture:scenes --out <dir> [--concurrency <n>] [--port <p>]
 *          pnpm capture:scenes --out <dir> --base-url http://localhost:4173
 */

import { chromium } from "@playwright/test";
import type { Browser, BrowserContext, Page } from "@playwright/test";
import { spawn, spawnSync } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import { setTheme, waitForStore } from "../browser/helpers/inject";
import {
  applyScene,
  listScenes,
  waitForSceneHarness,
} from "../browser/helpers/scenes";
import { waitForContentSettled } from "./screenshot-helpers";

// ─── Paths ──────────────────────────────────────────────────────────────────

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const UI_DIR = path.resolve(__dirname, "..");

// ─── Matrix ─────────────────────────────────────────────────────────────────

/** Canonical capture width. The app is desktop-only; 1280 is the review width. */
const WIDTH = 1280;
const HEIGHT = 900;

/**
 * Scenes also captured in light mode. The full matrix is captured in dark; this
 * curated subset adds light-mode coverage for the surfaces whose light treatment
 * matters most, keeping the baseline lean. Extend this list to widen light-mode
 * coverage. IDs must exist in `src/test/scenes.ts` (verified at runtime against
 * the live harness — an unknown id fails the capture loudly).
 */
const LIGHT_SCENES = new Set<string>([
  "selected", // list + inspector, the primary surface
  "empty", // empty state
  "table-mode", // table view
  "body-text", // a rendered body pane
  "cmdk-open", // command palette overlay
  "help-open", // keyboard-shortcuts dialog
]);

type Theme = "light" | "dark";
interface Cell {
  scene: string;
  theme: Theme;
}

// ─── CLI args ───────────────────────────────────────────────────────────────

interface Args {
  out: string;
  concurrency: number;
  port: number;
  baseUrl: string | null;
  build: boolean;
}

function parseArgs(argv: string[]): Args {
  let out = "";
  let concurrency = Number(process.env.CAPTURE_CONCURRENCY ?? 6);
  let port = Number(process.env.CAPTURE_PORT ?? 4180);
  let baseUrl: string | null = null;
  let build = true;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--out":
        out = argv[++i];
        break;
      case "--concurrency":
        concurrency = Number(argv[++i]);
        break;
      case "--port":
        port = Number(argv[++i]);
        break;
      case "--base-url":
        // Attach to an already-running server; skips build + preview spawn.
        baseUrl = argv[++i];
        break;
      case "--no-build":
        build = false;
        break;
      default:
        throw new Error(`capture-scenes: unknown argument: ${arg}`);
    }
  }

  if (!out) {
    throw new Error(
      "usage: capture-scenes --out <dir> [--concurrency <n>] [--port <p>] [--base-url <url>] [--no-build]",
    );
  }
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error(`capture-scenes: invalid --concurrency: ${concurrency}`);
  }
  return { out, concurrency, port, baseUrl, build };
}

// ─── Process lifecycle ──────────────────────────────────────────────────────

let previewProc: ChildProcess | null = null;
let browser: Browser | null = null;

function startPreview(port: number): void {
  // Call the preview server directly; the test build is produced separately
  // (see main) so a build failure aborts before we start serving.
  previewProc = spawn(
    "pnpm",
    ["preview", "--port", String(port), "--strictPort"],
    { cwd: UI_DIR, detached: true, stdio: "pipe" },
  );
  if (previewProc.pid == null)
    throw new Error("failed to spawn preview server");
  previewProc.stdout?.resume();
  previewProc.stderr?.on("data", (d: Buffer) => process.stderr.write(d));
}

async function cleanup(): Promise<void> {
  await browser?.close().catch(() => undefined);
  browser = null;

  const pid = previewProc?.pid;
  if (pid != null) {
    try {
      process.kill(-pid, "SIGTERM");
    } catch {
      // already gone
    }
    await sleep(500);
    try {
      process.kill(-pid, "SIGKILL");
    } catch {
      // already gone
    }
  }
  previewProc = null;
}

async function waitReady(url: string, timeoutMs = 60_000): Promise<void> {
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

// ─── Capture ────────────────────────────────────────────────────────────────

async function captureCell(
  baseUrl: string,
  outDir: string,
  cell: Cell,
): Promise<string> {
  if (browser == null) throw new Error("browser not launched");
  const ctx: BrowserContext = await browser.newContext({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: 1,
  });
  try {
    const page: Page = await ctx.newPage();
    // Empty services → AppShell opens no live SSE subscription, so the
    // scene-driven connection stays deterministic (mirrors fixture-matrix.spec).
    await page.route("**/info", (route) =>
      route.fulfill({ json: { services: [] } }),
    );
    await page.goto(`${baseUrl}/`);
    await waitForStore(page);
    await waitForSceneHarness(page);

    await applyScene(page, cell.scene);
    await setTheme(page, cell.theme);
    // Best-effort settle: most scenes clear their aria-busy regions promptly.
    // A few (e.g. the "awaiting response" body state) are deliberately and
    // permanently busy — those must be captured as-is, not waited out. With
    // animations frozen below, even a busy skeleton renders deterministically,
    // so a settle timeout is not a failure: note it and capture the busy state.
    try {
      await waitForContentSettled(page, { timeoutMs: 10_000 });
    } catch {
      console.log(
        `  (settle timed out — capturing busy state: ${cell.scene}-${cell.theme})`,
      );
    }

    const filename = `${cell.scene}-${WIDTH}-${cell.theme}.png`;
    await page.screenshot({
      path: path.join(outDir, filename),
      // Freeze CSS animations/transitions to their end state so live-dot pulses
      // and the like don't produce frame-dependent diff noise.
      animations: "disabled",
    });
    return filename;
  } finally {
    await ctx.close();
  }
}

/** Run `cells` through `worker` with at most `concurrency` in flight. */
async function runPool(
  cells: Cell[],
  concurrency: number,
  worker: (cell: Cell) => Promise<string>,
): Promise<void> {
  let next = 0;
  let done = 0;
  const total = cells.length;
  async function pump(): Promise<void> {
    while (next < cells.length) {
      const cell = cells[next++];
      const filename = await worker(cell);
      done++;
      console.log(`  [${done}/${total}] ${filename}`);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, cells.length) }, () => pump()),
  );
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const outDir = path.resolve(args.out);

  // Own the output dir: a fresh dir means the captured set is exactly the
  // matrix, with no stale artifact surviving a prior pass (so reg-suit's
  // actualDir is clean).
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  let baseUrl = args.baseUrl;
  if (baseUrl == null) {
    if (args.build) {
      console.log("Building test bundle (pnpm build:test)…");
      const build = spawnSync("pnpm", ["build:test"], {
        cwd: UI_DIR,
        stdio: "inherit",
      });
      if (build.status !== 0) {
        throw new Error(`pnpm build:test failed (exit ${build.status})`);
      }
    }
    baseUrl = `http://localhost:${args.port}`;
    console.log(`Starting preview server on :${args.port}…`);
    startPreview(args.port);
    await waitReady(`${baseUrl}/`);
    console.log("Preview server ready.");
  } else {
    console.log(`Using existing server at ${baseUrl}`);
  }

  browser = await chromium.launch({ headless: true });

  // Enumerate scenes from the live harness so the captured set IS the matrix.
  const probe = await browser.newContext();
  const probePage = await probe.newPage();
  await probePage.route("**/info", (route) =>
    route.fulfill({ json: { services: [] } }),
  );
  await probePage.goto(`${baseUrl}/`);
  await waitForStore(probePage);
  await waitForSceneHarness(probePage);
  const sceneIds = (await listScenes(probePage)).map((s) => s.id);
  await probe.close();

  if (sceneIds.length === 0) {
    throw new Error(
      "no scenes found — is the test-harness build being served? (pnpm build:test)",
    );
  }

  // Verify the light allowlist references real scenes — a typo there would
  // silently drop light coverage otherwise.
  const known = new Set(sceneIds);
  const unknownLight = [...LIGHT_SCENES].filter((id) => !known.has(id));
  if (unknownLight.length > 0) {
    throw new Error(
      `LIGHT_SCENES references unknown scene id(s): ${unknownLight.join(", ")}`,
    );
  }

  const cells: Cell[] = [
    ...sceneIds.map((scene): Cell => ({ scene, theme: "dark" })),
    ...sceneIds
      .filter((scene) => LIGHT_SCENES.has(scene))
      .map((scene): Cell => ({ scene, theme: "light" })),
  ];

  console.log(
    `Capturing ${cells.length} cells (${sceneIds.length} dark + ${
      cells.length - sceneIds.length
    } light) at width ${WIDTH}, concurrency ${args.concurrency}…`,
  );

  const start = Date.now();
  await runPool(cells, args.concurrency, (cell) =>
    captureCell(baseUrl, outDir, cell),
  );
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  console.log(
    `\n✓ Captured ${cells.length} screenshots to ${outDir} in ${elapsed}s`,
  );
}

// ─── Entry point ────────────────────────────────────────────────────────────

process.on("SIGINT", () => {
  void cleanup().then(() => process.exit(130));
});
process.on("SIGTERM", () => {
  void cleanup().then(() => process.exit(143));
});

main()
  .then(async () => {
    await cleanup();
    process.exit(0);
  })
  .catch(async (err: unknown) => {
    console.error("\ncapture-scenes failed:", err);
    await cleanup();
    process.exit(1);
  });
