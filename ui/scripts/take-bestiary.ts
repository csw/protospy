/**
 * take-bestiary.ts
 *
 * Generates a screenshot catalog of interesting UI display scenarios using
 * store injection (window.__test_store) — no Rust backend required.
 *
 * Output: a directory containing PNG screenshots and a markdown catalog
 * document that embeds them with explanatory context.
 *
 * Default output:  $HOME/obsidian/protospy/Claude/screenshots/bestiary/
 * Override:        BESTIARY_OUT=/some/dir tsx scripts/take-bestiary.ts
 *
 * Run via:         pnpm run screenshots:bestiary
 * or:              just screenshots-bestiary (from repo root)
 *
 * See:
 *   - PRO-219 — ticket
 *   - ~/obsidian/protospy/Claude/UI-screenshot-recipes.md — seed recipes
 *   - ui/scripts/take-screenshots.ts — sibling hero-screenshot pipeline
 */

import { chromium, type Browser, type Page } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import * as os from "node:os";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import {
  captureFilename,
  renderCatalog,
  type ScenarioMeta,
} from "./bestiary-catalog";
import {
  makeBinaryResponse,
  makeEncodedJsonResponse,
  makeGetRequest,
  makePostRequest,
  makeProxyError,
  makeResponse,
  makeSSEResponse,
} from "../src/test/fixtures";

// ─── Paths ────────────────────────────────────────────────────────────────────

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const UI_DIR = path.resolve(__dirname, "..");
const VITE_BIN = path.join(UI_DIR, "node_modules", ".bin", "vite");
const VITE_CONFIG = path.join(UI_DIR, "scripts", "vite.screenshots.config.ts");

const DEFAULT_OUT = path.join(
  os.homedir(),
  "obsidian",
  "protospy",
  "Claude",
  "screenshots",
  "bestiary",
);
const OUT_DIR = process.env.BESTIARY_OUT || DEFAULT_OUT;

// ─── Window/store typing ──────────────────────────────────────────────────────
// `window.__test_store` is the dev-only Zustand store exposed by the UI for
// browser-test harnesses (state/store.ts). We don't pull in the real store
// types here — that would couple the script to internal UI types — so we
// describe just the surface the script touches.

interface StoreLike {
  getState: () => {
    applyEvent: (msg: unknown) => void;
    darkMode: boolean;
    toggleDarkMode: () => void;
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

// Compressed JSON payload reused across compression scenarios. Same source
// JSON: {"items":[{"id":1,"name":"alpha"},{"id":2,"name":"beta"}]}
// Copied verbatim from browser/body-compressed.spec.ts — those base64
// strings round-trip through DecompressionStream / brotli-dec-wasm /
// zstd-wasm in the live browser-test suite, so they're known-good.
// (The brotli payload looks plaintext-ish because brotli encodes small
// inputs as literal blocks; this is correct output, not a degraded one.)
// Keep in sync if regenerated.
const GZIP_B64 =
  "H4sIAAAAAAAAE6tWyixJzS1WsoquVspMUbIy1FHKS8xNVbJSSswpyEhUqtWBiBvBxZNSSxKVamNrAXGp+bs6AAAA";
const GZIP_WIRE_BYTES = 66;
const DEFLATE_B64 =
  "eJyrVsosSc0tVrKKrlbKTFGyMtRRykvMTVWyUkrMKchIVKrVgYgbwcWTUksSlWpjawEXOhIm";
const DEFLATE_WIRE_BYTES = 54;
const BROTLI_B64 =
  "ixyAeyJpdGVtcyI6W3siaWQiOjEsIm5hbWUiOiJhbHBoYSJ9LHsiaWQiOjIsIm5hbWUiOiJiZXRhIn1dfQM=";
const BROTLI_WIRE_BYTES = 62;

// A small PNG-ish binary blob — same magic bytes the body decoder uses
// to classify as binary in browser/body-binary.spec.ts.
const BINARY_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR4nGP4DwABAQEAWk1v8QAAAABJRU5ErkJggg==";
const BINARY_WIRE_BYTES = 67;

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

// SSE in-flight (streaming) — at_end:false, no terminator.
function makeStreamingSSE(
  id: number,
  partial: string,
  ts?: string,
): Record<string, unknown> {
  return {
    exchange: { exchange_id: id, timestamp: ts ?? new Date().toISOString() },
    direction: "Response",
    event: {
      type: "Response",
      status: "200 OK",
      version: "HTTP/1.1",
      headers: [{ name: "Content-Type", value: "text/event-stream" }],
      elapsed_ms: 50,
      body: {
        type: "Data",
        content: {
          offset: 0,
          length: partial.length,
          payload: { text: partial },
        },
        trailers: null,
        at_end: false,
        total_bytes: partial.length,
      },
    },
  };
}

// ─── Scenario definitions ─────────────────────────────────────────────────────

type Msg = Record<string, unknown>;

type Capture = {
  /** Filename suffix slug, e.g. "list", "selected", "headers". */
  slug: string;
  /** Caption rendered under the image. */
  description?: string;
  /** If set, screenshot is clipped to this element rather than full viewport. */
  componentSelector?: string;
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

const SCENARIOS: Scenario[] = [
  // ── Network errors ────────────────────────────────────────────────────────
  {
    family: "Network errors",
    slug: "network-errors-connect-refused",
    title: "Connect refused",
    description:
      "Upstream refused the TCP connection before the response started. " +
      "List row shows `Error`; context bar shows `Network error` with the " +
      "full message inline; the request body pane surfaces the same error " +
      "above the (empty) body area. See PRO-217 / PRO-220.",
    messages: [
      makeGetRequest(1, "/api/users/42", t(30)),
      makeProxyError(
        1,
        "Request",
        "client error (Connect): tcp connect error: Connection refused (os error 61)",
        t(30),
      ),
    ],
    interact: async (page) => {
      await page.getByText("/api/users/42").first().click();
    },
    captures: [
      { slug: "selected", description: "Inspector on Bodies tab." },
      {
        slug: "headers",
        description: "Headers tab — empty response side.",
        prepare: async (page) => {
          await page.getByRole("tab", { name: "Headers" }).click();
        },
      },
    ],
  },
  {
    family: "Network errors",
    slug: "network-errors-timeout",
    title: "Upstream timeout",
    description:
      "Request body was sent, then the upstream connection timed out. " +
      "Request body pane is populated; the response side is empty.",
    messages: [
      makePostRequest(2, "/api/orders", '{"qty":1}', t(20)),
      makeProxyError(
        2,
        "Request",
        "error trying to connect: operation timed out",
        t(20),
      ),
    ],
    interact: async (page) => {
      await page.getByText("/api/orders").first().click();
    },
    captures: [
      { slug: "selected", description: "Bodies tab — request body retained." },
    ],
  },
  {
    family: "Network errors",
    slug: "network-errors-midstream",
    title: "Mid-stream disconnect",
    description:
      "Response started (`status` is set), then the upstream closed mid-body. " +
      "After PRO-220 the error is surfaced symmetrically: the status code " +
      "stays primary, and an `Interrupted` indicator + error message appear " +
      "in the list row (`· Interrupted`) and the context bar. The response " +
      "body pane shows the error banner above any partial bytes. SSE Stream " +
      "view currently shows `live` incorrectly — see PRO-221.",
    messages: [
      makeGetRequest(3, "/api/stream", t(10)),
      makeStreamingSSE(3, 'data: {"event":"start"}\n', t(10)),
      makeProxyError(
        3,
        "Response",
        "error reading a body from connection: connection reset by peer",
        t(10),
      ),
    ],
    interact: async (page) => {
      await page.getByText("/api/stream").first().click();
    },
    captures: [
      {
        slug: "selected",
        description:
          "Full viewport — status code primary, with `Interrupted` indicator " +
          "+ error message in the list row and context bar.",
      },
      {
        slug: "stream-view",
        description:
          "Stream view only — note the (incorrect) `live` indicator. PRO-221.",
        componentSelector: '[role="tabpanel"][data-state="active"]',
      },
    ],
  },

  // ── Compressed bodies ────────────────────────────────────────────────────
  {
    family: "Compressed bodies",
    slug: "compression-gzip",
    title: "gzip-compressed JSON",
    description:
      "Chrome DevTools-style dual `wire / decoded` size display plus the " +
      "`(gzip)` encoding suffix. The dual form appears once the body decode " +
      "pipeline has cached `decodedBytes`; before that the list shows " +
      "`wire (gzip)` only. Selecting the row mounts the Bodies tab and " +
      "triggers decode. See PRO-216.",
    messages: [
      makeGetRequest(1, "/api/products/featured", t(5)),
      makeEncodedJsonResponse(1, GZIP_B64, GZIP_WIRE_BYTES, "gzip", t(5)),
      // A contrast row so the list isn't all one encoding.
      makeGetRequest(2, "/api/health", t(3)),
      makeResponse(2, "200 OK", '{"ok":true,"v":1}', t(3)),
    ],
    interact: async (page) => {
      await page.getByText("/api/products/featured").first().click();
    },
    captures: [
      {
        slug: "list-and-body",
        description:
          "List shows `res 66B/58B (gzip)`; body pane shows `66B / 58B`.",
      },
      {
        slug: "body-pane",
        description:
          "Body pane head close-up: `66B → 58B` dual-size indicator.",
        componentSelector: '[role="tabpanel"][data-state="active"]',
      },
    ],
  },
  {
    family: "Compressed bodies",
    slug: "compression-deflate",
    title: "deflate-compressed JSON",
    description:
      "Same payload, deflate encoding. The wire/decoded sizes differ from gzip.",
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
    family: "Compressed bodies",
    slug: "compression-brotli",
    title: "brotli-compressed JSON",
    description:
      "Brotli decompression goes through `brotli-dec-wasm` (WASM, lazy-loaded). " +
      "If the WASM fails to load the body pane will show a decode error.",
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

  // ── Binary bodies ────────────────────────────────────────────────────────
  {
    family: "Binary bodies",
    slug: "binary-png",
    title: "Binary (PNG) response",
    description:
      "The decoder classifies the bytes as `binary` and the body pane shows a " +
      "hex/preview view rather than text. Useful for confirming we don't try " +
      "to render bytes as UTF-8 text.",
    messages: [
      makeGetRequest(1, "/images/pixel.png", t(2)),
      makeBinaryResponse(1, BINARY_BASE64, BINARY_WIRE_BYTES, t(2)),
    ],
    interact: async (page) => {
      await page.getByText("/images/pixel.png").first().click();
    },
    captures: [
      {
        slug: "body-pane",
        description: "Body pane only — binary classification.",
        componentSelector: '[role="tabpanel"][data-state="active"]',
      },
    ],
  },

  // ── Large JSON ───────────────────────────────────────────────────────────
  {
    family: "Large JSON bodies",
    slug: "large-json",
    title: "Large JSON response",
    description:
      "A few hundred-row JSON body exercises the JSON viewer's virtualization " +
      "path. The body pane head shows the wire size; the viewer renders only " +
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

  // ── SSE streaming ────────────────────────────────────────────────────────
  {
    family: "SSE streaming responses",
    slug: "sse-live",
    title: "Stream in flight (live)",
    description:
      "Response body has `at_end: false` and no follow-up Error — the Stream " +
      "view shows the live indicator and the parsed events to date.",
    messages: [
      makeGetRequest(1, "/api/events", t(5)),
      makeStreamingSSE(
        1,
        'event: tick\ndata: {"i":1}\n\nevent: tick\ndata: {"i":2}\n\n',
        t(5),
      ),
    ],
    interact: async (page) => {
      await page.getByText("/api/events").first().click();
    },
    captures: [
      {
        slug: "stream-view",
        description: "Stream tab — `live` indicator visible.",
        componentSelector: '[role="tabpanel"][data-state="active"]',
      },
    ],
  },
  {
    family: "SSE streaming responses",
    slug: "sse-complete",
    title: "Stream complete",
    description:
      "`at_end: true` — the live indicator drops and the event count is final.",
    messages: [
      makeGetRequest(1, "/api/events-final", t(5)),
      makeSSEResponse(
        1,
        'event: tick\ndata: {"i":1}\n\nevent: tick\ndata: {"i":2}\n\nevent: done\ndata: {}\n\n',
        t(5),
      ),
    ],
    interact: async (page) => {
      await page.getByText("/api/events-final").first().click();
    },
    captures: [
      {
        slug: "stream-view",
        description: "Stream tab — final state.",
        componentSelector: '[role="tabpanel"][data-state="active"]',
      },
    ],
  },

  // ── HTTP error status codes ──────────────────────────────────────────────
  {
    family: "HTTP error status codes",
    slug: "status-mixed",
    title: "Mixed 2xx / 4xx / 5xx",
    description:
      "Three rows side by side so the colour treatment from `statusTextClass` " +
      "is directly comparable. List view only — selection adds detail but not " +
      "what we're documenting here.",
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

  // ── Empty responses ──────────────────────────────────────────────────────
  {
    family: "Empty responses",
    slug: "empty-204",
    title: "204 No Content",
    description:
      "Response has `NoBody`. List shows the status; the Bodies tab shows an " +
      "empty state rather than a stale decoded value.",
    messages: [
      makeGetRequest(1, "/api/resources/1", t(3)),
      makeResponse(1, "204 No Content", undefined, t(3)),
    ],
    interact: async (page) => {
      await page.getByText("/api/resources/1").first().click();
    },
    captures: [
      {
        slug: "body-pane",
        description: "Body pane only — empty response.",
        componentSelector: '[role="tabpanel"][data-state="active"]',
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
  // Stub the backend endpoints so the UI loads cleanly without a connecting
  // banner. Mirror the pattern used in browser/body-compressed.spec.ts.
  await page.route("**/info", (route) =>
    route.fulfill({ json: { services: [{ name: "test-backend" }] } }),
  );
  await page.route("**/service/test-backend/events", (route) =>
    route.fulfill({ contentType: "text/event-stream", body: "" }),
  );
  // Catch-all for any other /service/... subpath
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

  // Defensive reset (clears any persisted prefs / leftover state).
  await page.evaluate(() => {
    const s = (window as unknown as WindowWithStore).__test_store;
    s.setState(s.getInitialState(), true);
  });

  // Force dark mode to match the hero-screenshot baseline.
  await page.evaluate(() => {
    const st = (window as unknown as WindowWithStore).__test_store.getState();
    if (!st.darkMode) st.toggleDarkMode();
  });
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
      await locator.screenshot({ path: outPath });
    } else {
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

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
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
  for (const scenario of SCENARIOS) {
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
      "All scenarios reset the store between runs (`setState(getInitialState(), true)`) " +
      "so each section is independent of the others.",
  });
  const catalogPath = path.join(OUT_DIR, "bestiary.md");
  await writeFile(catalogPath, md, "utf8");
  console.log(`\n✓ Catalog: ${catalogPath}`);
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
