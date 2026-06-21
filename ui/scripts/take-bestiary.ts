/**
 * take-bestiary.ts
 *
 * Generates a screenshot catalog of interesting UI display scenarios using
 * store injection — no Rust backend required.
 *
 * The catalog is the fixture matrix (`src/test/scenes.ts`): every scene becomes
 * a catalog entry — a full-viewport shot plus any clipped close-ups it declares
 * (`Scene.bestiaryCloseups`) — so a scene added to the matrix appears here
 * automatically. Scenes flagged `bestiaryOnly` (documented here but not part of
 * the test matrix) render in a trailing section. The bestiary adds the browsable
 * screenshot + description catalog the matrix alone doesn't produce (PRO-410).
 *
 * Output: a directory containing PNG screenshots and a markdown catalog
 * document that embeds them with explanatory context.
 *
 * Default output:  $VAULT_BASE/screenshots/bestiary/
 *                   (falls back to $HOME/obsidian/protospy/Claude/screenshots/bestiary/
 *                    when VAULT_BASE is unset)
 * Override:        BESTIARY_OUT=/some/dir tsx scripts/take-bestiary.ts
 *
 * Run via:         pnpm run screenshots:bestiary
 * or:              just screenshots-bestiary (from repo root)
 *
 * See:
 *   - PRO-219 — ticket
 *   - $VAULT_BASE/UI-screenshot-recipes.md — seed recipes
 *   - ui/scripts/take-screenshots.ts — sibling hero-screenshot pipeline
 */

import {
  chromium,
  type Browser,
  type Locator,
  type Page,
} from "@playwright/test";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import * as os from "node:os";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import {
  captureFilename,
  matrixSceneToMeta,
  orderBestiaryScenes,
  renderCatalog,
  type ScenarioMeta,
} from "./bestiary-catalog";

import {
  waitForBusyPresent,
  waitForContentSettled,
} from "./screenshot-helpers";

import { SCENES, type Scene } from "../src/test/scenes";
import { applyScene, waitForSceneHarness } from "../browser/helpers/scenes";

// ─── Paths ────────────────────────────────────────────────────────────────────

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const UI_DIR = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(UI_DIR, "..");
const VITE_BIN = path.join(UI_DIR, "node_modules", ".bin", "vite");
const VITE_CONFIG = path.join(UI_DIR, "scripts", "vite.screenshots.config.ts");
const UPLOAD_SCRIPT = path.join(
  REPO_ROOT,
  "scripts",
  "agents",
  "upload-screenshot",
);

// Default to the agent workspace in the Obsidian vault ($VAULT_BASE) when it is
// configured, falling back to the maintainer's conventional vault layout so the
// script still works without configuration. Override either with BESTIARY_OUT.
const VAULT_BASE =
  process.env.VAULT_BASE ||
  path.join(os.homedir(), "obsidian", "protospy", "Claude");
const DEFAULT_OUT = path.join(VAULT_BASE, "screenshots", "bestiary");
const OUT_DIR = process.env.BESTIARY_OUT || DEFAULT_OUT;

// ─── Window/store typing ──────────────────────────────────────────────────────
// `window.__test_store` is the dev-only Zustand store exposed by the UI for
// browser-test harnesses (state/store.ts). We don't pull in the real store
// types here — that would couple the script to internal UI types — so we
// describe just the surface the script touches.

interface StoreLike {
  getState: () => {
    applyEvent: (msg: unknown) => void;
  };
  getInitialState: () => unknown;
  setState: (s: unknown, replace?: boolean) => void;
  persist?: { hasHydrated?: () => boolean };
}

interface WindowWithStore extends Window {
  __test_store: StoreLike;
}

// ─── Ports ────────────────────────────────────────────────────────────────────
// Pick a port that doesn't collide with the hero-screenshots pipeline
// (6220–6223) or a running dev server (5173).

const UI_PORT = 6224;

// ─── Process lifecycle ────────────────────────────────────────────────────────

const childPids: number[] = [];
let browser: Browser | null = null;

function spawnDetached(cmd: string, args: string[]): ChildProcess {
  const child = spawn(cmd, args, {
    cwd: UI_DIR,
    detached: true,
    stdio: "pipe",
  });
  if (child.pid == null) throw new Error(`Failed to spawn: ${cmd}`);
  childPids.push(child.pid);
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
      // Already gone.
    }
  }
  await sleep(500);
  for (const pid of childPids) {
    try {
      process.kill(-pid, "SIGKILL");
    } catch {
      // Already gone.
    }
  }
}

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

// ─── Page setup ───────────────────────────────────────────────────────────────

async function setupPage(page: Page): Promise<void> {
  // Stub /info with no services so AppShell opens no live SSE subscription —
  // its status callback would otherwise clobber a scene's injected connection
  // state and float a "reconnecting" toast over every capture. This mirrors
  // capture-scenes.ts (the canonical fixture-matrix capture path). The
  // catch-all /service route is a defensive no-op: with no services, nothing
  // subscribes.
  await page.route("**/info", (route) =>
    route.fulfill({ json: { services: [] } }),
  );
  await page.route("**/service/**", (route) =>
    route.fulfill({ contentType: "text/event-stream", body: "" }),
  );

  await page.goto(`http://localhost:${UI_PORT}/`);

  // Wait for the store to mount and (if applicable) for persist to hydrate.
  await page.waitForFunction(
    () => {
      const w = window as unknown as WindowWithStore;
      const s = w.__test_store;
      return s != null && (s.persist?.hasHydrated?.() ?? true);
    },
    undefined,
    { timeout: 10_000 },
  );

  // The fixture-matrix harness is installed under the same DEV gate as
  // __test_store; matrix scenes are applied through it (`applyScene`).
  await waitForSceneHarness(page);

  // Defensive reset (clears any persisted prefs / leftover state).
  await page.evaluate(() => {
    const s = (window as unknown as WindowWithStore).__test_store;
    s.setState(s.getInitialState(), true);
  });

  // Force dark mode via the next-themes bridge (window.__test_theme.setTheme).
  // Theme moved out of the Zustand store with the v2.3 next-themes swap.
  interface WindowWithTheme extends Window {
    __test_theme: { setTheme: (theme: string) => void };
  }
  await page.waitForFunction(
    () => !!(window as unknown as WindowWithTheme).__test_theme?.setTheme,
    undefined,
    { timeout: 10_000 },
  );
  await page.evaluate(() => {
    (window as unknown as WindowWithTheme).__test_theme.setTheme("dark");
  });
  // Wait for the .dark class to land on <html>
  await page.waitForFunction(
    () => document.documentElement.classList.contains("dark"),
    undefined,
    { timeout: 5_000 },
  );
}

/**
 * Render one fixture-matrix scene as a catalog entry: apply it through the
 * `window.__test_scenes` harness, run its `interact` step if any, take the
 * full-viewport capture, then take any clipped close-ups the scene declares
 * (`bestiaryCloseups`) — the focused element shots the full-viewport matrix
 * capture alone doesn't convey.
 */
async function runMatrixScene(page: Page, scene: Scene): Promise<ScenarioMeta> {
  // Fresh page per scene — guarantees no residue between cells.
  await setupPage(page);
  await applyScene(page, scene.id);

  if (scene.interact) {
    await scene.interact(page);
    // Tiny settle — Radix tab activation has a frame of transition.
    await sleep(150);
  }

  const meta = matrixSceneToMeta(scene);

  // Full-viewport context shot, taken once the scene is ready (see captureReady).
  const viewCapture = meta.captures[0];
  await captureReady(page, scene);
  await page.screenshot({ path: path.join(OUT_DIR, viewCapture.filename) });
  console.log(`  ✓ ${viewCapture.filename}`);

  // Clipped close-ups for the element this scene is really about.
  for (const closeup of scene.bestiaryCloseups ?? []) {
    const filename = captureFilename(scene.id, closeup.slug);
    const locator = page.locator(closeup.componentSelector).first();
    await captureReady(locator, scene);
    await locator.screenshot({ path: path.join(OUT_DIR, filename) });
    console.log(`  ✓ ${filename}`);
  }

  return meta;
}

/**
 * Wait until `target` is ready to capture. By default that means its loading
 * (`aria-busy`) regions have cleared. A scene flagged `bestiaryBusyTerminal`
 * is intentionally and permanently busy (e.g. "Awaiting response…"), so the
 * readiness signal is the busy region *appearing* — waiting for it to clear
 * would never resolve. Either way the wait is a positive condition, not a
 * swallowed timeout.
 */
async function captureReady(
  target: Page | Locator,
  scene: Scene,
): Promise<void> {
  if (scene.bestiaryBusyTerminal) {
    await waitForBusyPresent(target);
  } else {
    await waitForContentSettled(target);
  }
}

// ─── Subcommands ──────────────────────────────────────────────────────────────

function uploadToS3(date: string): void {
  console.log("\n▸ Uploading to S3…");
  execFileSync(
    UPLOAD_SCRIPT,
    [OUT_DIR, "--prefix", `bestiary/${date}`, "--catalog"],
    { stdio: "inherit", cwd: REPO_ROOT },
  );
}

async function runGenerate(doUpload: boolean): Promise<void> {
  await mkdir(OUT_DIR, { recursive: true });
  console.log(`Output directory: ${OUT_DIR}`);

  // Boot Vite dev server (screenshots config — port 6224, no backend).
  spawnDetached(VITE_BIN, ["--config", VITE_CONFIG, "--port", String(UI_PORT)]);
  console.log(`✓ Vite starting on :${UI_PORT}`);
  await waitReady(`http://localhost:${UI_PORT}/`);
  console.log("✓ Vite ready");

  browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 720 },
  });
  const page = await ctx.newPage();

  const metas: ScenarioMeta[] = [];

  // Every scene becomes a catalog entry: matrix cells grouped by axis, then any
  // bestiary-only scenes as a trailing section (see orderBestiaryScenes).
  const scenes = orderBestiaryScenes(SCENES);
  console.log(`\n▸ ${scenes.length} scenes`);
  for (const scene of scenes) {
    const group = scene.bestiaryOnly ? "bestiary-only" : scene.axis;
    console.log(`\n▸ ${group} — ${scene.title}`);
    try {
      metas.push(await runMatrixScene(page, scene));
    } catch (err) {
      console.error(`  ✗ Failed: ${(err as Error).message}`);
      throw err;
    }
  }

  await browser.close();
  browser = null;

  const today = new Date().toISOString().slice(0, 10);
  const md = renderCatalog(metas, {
    date: today,
    intro:
      "Generated from the fixture matrix (`src/test/scenes.ts`) — one entry per " +
      "scene, so a scene added to the matrix appears here automatically. The " +
      "trailing bestiary-only section documents diagnostic-interest states that " +
      "are covered by tests but kept out of the matrix. Every entry resets the " +
      "store before it renders, so sections are independent of one another.",
  });
  const catalogPath = path.join(OUT_DIR, "bestiary.md");
  await writeFile(catalogPath, md, "utf8");
  console.log(`\n✓ Catalog: ${catalogPath}`);

  if (doUpload) {
    uploadToS3(today);
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const subcommand = args.find((a) => !a.startsWith("--")) ?? "generate";

  if (subcommand === "upload") {
    const dateArg = args.find((a) => a.startsWith("--date="))?.slice(7);
    const date = dateArg ?? new Date().toISOString().slice(0, 10);
    uploadToS3(date);
  } else if (subcommand === "generate") {
    await runGenerate(args.includes("--upload"));
  } else {
    console.error(
      `Unknown subcommand: ${subcommand}. Use 'generate' or 'upload'.`,
    );
    process.exit(1);
  }
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
    console.error("\nBestiary failed:", err);
    await cleanup();
    process.exit(1);
  });
