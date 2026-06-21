/**
 * take-bestiary.ts
 *
 * Generates a screenshot catalog of interesting UI display scenarios using
 * store injection — no Rust backend required.
 *
 * Two sources feed the catalog:
 *   1. The fixture matrix (`src/test/scenes.ts`, via `window.__test_scenes`) is
 *      the primary content — every matrix cell becomes a catalog entry, so a
 *      scene added to the matrix appears here automatically with no extra
 *      wiring. The bestiary adds the browsable screenshot + description catalog
 *      the matrix alone doesn't produce.
 *   2. A small, explicitly-justified list of supplementary scenarios
 *      (`SUPPLEMENTARY_SCENARIOS`) for diagnostic-interest states the matrix
 *      intentionally doesn't cover. Each entry exists because the matrix doesn't
 *      cover it and shouldn't (PRO-410).
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

import { chromium, type Browser, type Page } from "@playwright/test";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import * as os from "node:os";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import {
  captureFilename,
  matrixSceneToMeta,
  orderScenesByAxis,
  renderCatalog,
  type ScenarioMeta,
} from "./bestiary-catalog";

import { waitForContentSettled } from "./screenshot-helpers";

import {
  makeEncodedJsonResponse,
  makeGetRequest,
  makeResponse,
} from "../src/test/fixtures";
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

// ─── Fixture payloads ─────────────────────────────────────────────────────────

// Helper: timestamp `s` seconds in the past, so "Xs ago" renders naturally.
const t = (s: number) => new Date(Date.now() - s * 1000).toISOString();

// Compressed JSON payloads for the supplementary compression scenarios. Same
// source JSON: {"items":[{"id":1,"name":"alpha"},{"id":2,"name":"beta"}]}
// Copied verbatim from browser/body-compressed.spec.ts — those base64 strings
// round-trip through DecompressionStream / brotli-dec-wasm in the live
// browser-test suite, so they're known-good. (The brotli payload looks
// plaintext-ish because brotli encodes small inputs as literal blocks; this is
// correct output, not a degraded one.) The matrix's dual-size cell already
// covers gzip, so only deflate and brotli live here. Keep in sync if
// regenerated.
const DEFLATE_B64 =
  "eJyrVsosSc0tVrKKrlbKTFGyMtRRykvMTVWyUkrMKchIVKrVgYgbwcWTUksSlWpjawEXOhIm";
const DEFLATE_WIRE_BYTES = 54;
const BROTLI_B64 =
  "ixyAeyJpdGVtcyI6W3siaWQiOjEsIm5hbWUiOiJhbHBoYSJ9LHsiaWQiOjIsIm5hbWUiOiJiZXRhIn1dfQM=";
const BROTLI_WIRE_BYTES = 62;

// Build a moderately large JSON body — large enough to trigger the body pane's
// virtualization path but not so large the script becomes slow.
function makeLargeJson(items: number): string {
  const arr = Array.from({ length: items }, (_, i) => ({
    id: i,
    name: `item-${i}`,
    value: Math.round(Math.random() * 1_000_000),
    tags: ["alpha", "beta", "gamma"],
  }));
  return JSON.stringify({ items: arr }, null, 2);
}

// ─── Supplementary scenario definitions ────────────────────────────────────────

type Msg = Record<string, unknown>;

type Capture = {
  /** Filename suffix slug, e.g. "list", "selected", "headers". */
  slug: string;
  /** Caption rendered under the image. */
  description?: string;
  /** If set, screenshot is clipped to this element rather than full viewport. */
  componentSelector?: string;
  /**
   * Set when the capture deliberately showcases a loading skeleton. Suppresses
   * the wait-for-content-settled step that otherwise holds until skeletons
   * clear, so an intentional loading-state scene isn't blocked waiting for
   * itself.
   */
  showsLoadingState?: boolean;
  /** Run before capturing — click a tab, hover something, etc. */
  prepare?: (page: Page) => Promise<void>;
};

type Scenario = {
  /** Family grouping shown as `##` heading in the catalog. */
  family: string;
  /** Scenario slug, used as filename prefix. */
  slug: string;
  /** Title shown in the catalog (`###`). */
  title: string;
  /** Markdown paragraph above the captures. */
  description: string;
  /** EventMessages to inject. */
  messages: Msg[];
  /** After injection, drive the UI (select rows, switch tabs). */
  interact?: (page: Page) => Promise<void>;
  /** Captures to take after interact runs. */
  captures: Capture[];
};

const SUPPLEMENTARY_SCENARIOS: Scenario[] = [
  // Each entry exists because the fixture matrix does not cover it and
  // shouldn't (PRO-410). Keep this list small and justify every addition in
  // the description's leading "Supplementary —" sentence.

  // ── Compressed bodies (non-gzip encodings) ─────────────────────────────────
  {
    family: "Compressed bodies (supplementary)",
    slug: "compression-deflate",
    title: "deflate-compressed JSON",
    description:
      "Supplementary — the matrix covers only gzip (its dual-size cell). " +
      "deflate is a distinct Content-Encoding whose wire/decoded sizes differ.",
    messages: [
      makeGetRequest(1, "/api/search", t(4)),
      makeEncodedJsonResponse(
        1,
        DEFLATE_B64,
        DEFLATE_WIRE_BYTES,
        "deflate",
        t(4),
      ),
    ],
    interact: async (page) => {
      await page.getByText("/api/search").first().click();
    },
    captures: [
      {
        slug: "body-pane",
        description: "Body pane only — `(deflate)` indicator.",
        componentSelector: '[role="tabpanel"][data-state="active"]',
      },
    ],
  },
  {
    family: "Compressed bodies (supplementary)",
    slug: "compression-brotli",
    title: "brotli-compressed JSON",
    description:
      "Supplementary — the matrix has no brotli body. brotli decompression " +
      "goes through `brotli-dec-wasm` (WASM, lazy-loaded), a distinct decode " +
      "path worth documenting; a WASM load failure surfaces as a decode error.",
    messages: [
      makeGetRequest(1, "/api/brotli", t(4)),
      makeEncodedJsonResponse(1, BROTLI_B64, BROTLI_WIRE_BYTES, "br", t(4)),
    ],
    interact: async (page) => {
      await page.getByText("/api/brotli").first().click();
    },
    captures: [
      {
        slug: "body-pane",
        description: "Body pane only — `(br)` indicator.",
        componentSelector: '[role="tabpanel"][data-state="active"]',
      },
    ],
  },

  // ── Large JSON body ────────────────────────────────────────────────────────
  {
    family: "Large JSON bodies (supplementary)",
    slug: "large-json",
    title: "Large JSON response",
    description:
      "Supplementary — the matrix has no large well-formed JSON body (its " +
      "many-rows cell stresses list virtualization, not the body viewer). A " +
      "few-hundred-row JSON body exercises the JSON viewer's virtualization " +
      "path: the body pane head shows the wire size; the viewer renders only " +
      "what's on screen.",
    messages: [
      makeGetRequest(1, "/api/items", t(4)),
      makeResponse(1, "200 OK", makeLargeJson(500), t(4)),
    ],
    interact: async (page) => {
      await page.getByText("/api/items").first().click();
    },
    captures: [
      {
        slug: "body-pane",
        description: "JSON viewer only — top of a 500-item document.",
        componentSelector: '[role="tabpanel"][data-state="active"]',
      },
    ],
  },

  // ── HTTP status colour comparison (rows mode) ──────────────────────────────
  {
    family: "HTTP status colour (supplementary)",
    slug: "status-mixed",
    title: "Mixed 2xx / 4xx / 5xx",
    description:
      "Supplementary — the matrix's mixed-table cell shows mixed statuses in " +
      "table mode, not a focused rows-mode comparison. Three rows side by " +
      "side so the `statusTextClass` colour treatment for 200 / 404 / 500 is " +
      "directly comparable.",
    messages: [
      makeGetRequest(1, "/api/healthz", t(8)),
      makeResponse(1, "200 OK", '{"ok":true}', t(8)),
      makeGetRequest(2, "/api/users/missing", t(6)),
      makeResponse(2, "404 Not Found", '{"error":"not found"}', t(6)),
      makeGetRequest(3, "/api/crash", t(4)),
      makeResponse(3, "500 Internal Server Error", '{"error":"boom"}', t(4)),
    ],
    captures: [
      {
        slug: "list",
        description:
          "Exchange list only — status colour treatment for 200 / 404 / 500.",
        componentSelector: '[aria-label="Requests"]',
      },
    ],
  },
];

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

async function runScenario(
  page: Page,
  scenario: Scenario,
): Promise<ScenarioMeta> {
  // Fresh page per scenario — guarantees no residue between cases.
  await setupPage(page);

  await page.evaluate((msgs) => {
    const { applyEvent } = (
      window as unknown as WindowWithStore
    ).__test_store.getState();
    for (const m of msgs) applyEvent(m);
  }, scenario.messages);

  if (scenario.interact) {
    await scenario.interact(page);
    // Tiny settle — Radix tab activation has a frame of transition.
    await sleep(150);
  }

  const captureMetas = [];
  for (const capture of scenario.captures) {
    if (capture.prepare) {
      await capture.prepare(page);
      await sleep(150);
    }
    const filename = captureFilename(scenario.slug, capture.slug);
    const outPath = path.join(OUT_DIR, filename);

    if (capture.componentSelector) {
      const locator = page.locator(capture.componentSelector).first();
      if (!capture.showsLoadingState) await waitForContentSettled(locator);
      await locator.screenshot({ path: outPath });
    } else {
      if (!capture.showsLoadingState) await waitForContentSettled(page);
      await page.screenshot({ path: outPath });
    }
    console.log(`  ✓ ${filename}`);
    captureMetas.push({
      slug: capture.slug,
      description: capture.description,
      filename,
    });
  }

  return {
    family: scenario.family,
    slug: scenario.slug,
    title: scenario.title,
    description: scenario.description,
    captures: captureMetas,
  };
}

/**
 * Render one fixture-matrix scene as a catalog entry: apply it through the
 * `window.__test_scenes` harness (the same applier the visual review uses),
 * run its `interact` step if any, and take a single full-viewport capture.
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
  const capture = meta.captures[0];
  const outPath = path.join(OUT_DIR, capture.filename);

  // Most scenes clear their aria-busy regions promptly; a few (e.g.
  // "body-awaiting") are deliberately and permanently busy — capture those
  // as-is rather than waiting them out. Mirrors capture-scenes.ts.
  try {
    await waitForContentSettled(page, { timeoutMs: 10_000 });
  } catch {
    console.log(`  (settle timed out — capturing busy state: ${scene.id})`);
  }
  await page.screenshot({ path: outPath });
  console.log(`  ✓ ${capture.filename}`);

  return meta;
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

  // Primary content: every fixture-matrix cell, grouped by axis.
  const matrixScenes = orderScenesByAxis(SCENES);
  console.log(`\n▸ Fixture matrix — ${matrixScenes.length} scenes`);
  for (const scene of matrixScenes) {
    console.log(`\n▸ ${scene.axis} — ${scene.title}`);
    try {
      metas.push(await runMatrixScene(page, scene));
    } catch (err) {
      console.error(`  ✗ Failed: ${(err as Error).message}`);
      throw err;
    }
  }

  // Supplementary: states the matrix intentionally doesn't cover.
  console.log(
    `\n▸ Supplementary — ${SUPPLEMENTARY_SCENARIOS.length} scenarios`,
  );
  for (const scenario of SUPPLEMENTARY_SCENARIOS) {
    console.log(`\n▸ ${scenario.family} — ${scenario.title}`);
    try {
      metas.push(await runScenario(page, scenario));
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
      "The matrix sections below are generated from the fixture matrix " +
      "(`src/test/scenes.ts`) — one entry per cell, so a scene added to the " +
      "matrix appears here automatically. The trailing supplementary sections " +
      "document diagnostic-interest states the matrix intentionally omits. " +
      "Every entry resets the store before it renders, so sections are " +
      "independent of one another.",
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
