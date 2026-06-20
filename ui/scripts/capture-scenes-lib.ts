/**
 * capture-scenes-lib.ts
 *
 * Pure (no-Playwright, no-process) helpers for capture-scenes.ts: the matrix
 * constants, CLI parsing, cell planning, and the bounded concurrency pool. Kept
 * separate so they can be unit-tested without launching a browser or a server.
 */

// ─── Matrix ─────────────────────────────────────────────────────────────────

/** Canonical capture width. The app is desktop-only; 1280 is the review width. */
export const WIDTH = 1280;
export const HEIGHT = 900;

/**
 * Scenes also captured in light mode. The full matrix is captured in dark; this
 * curated subset adds light-mode coverage for the surfaces whose light treatment
 * matters most, keeping the baseline lean. Extend this list to widen light-mode
 * coverage. IDs must exist in `src/test/scenes.ts` (verified at runtime against
 * the live harness — an unknown id fails the capture loudly via `planCells`).
 */
export const LIGHT_SCENES = new Set<string>([
  "selected", // list + inspector, the primary surface
  "empty", // empty state
  "table-mode", // table view
  "body-text", // a rendered body pane
  "cmdk-open", // command palette overlay
  "help-open", // keyboard-shortcuts dialog
]);

export type Theme = "light" | "dark";
export interface Cell {
  scene: string;
  theme: Theme;
}

// ─── CLI args ───────────────────────────────────────────────────────────────

export interface Args {
  out: string;
  concurrency: number;
  port: number;
  baseUrl: string | null;
  build: boolean;
}

export function parseArgs(argv: string[]): Args {
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

// ─── Cell planning ──────────────────────────────────────────────────────────

/**
 * Build the capture cell list from the live scene ids: every scene in dark, plus
 * the `LIGHT_SCENES` subset in light. Throws if the light allowlist names a scene
 * the running app doesn't expose — a typo there would otherwise silently drop
 * light coverage.
 */
export function planCells(sceneIds: string[]): Cell[] {
  const known = new Set(sceneIds);
  const unknownLight = [...LIGHT_SCENES].filter((id) => !known.has(id));
  if (unknownLight.length > 0) {
    throw new Error(
      `LIGHT_SCENES references unknown scene id(s): ${unknownLight.join(", ")}`,
    );
  }
  return [
    ...sceneIds.map((scene): Cell => ({ scene, theme: "dark" })),
    ...sceneIds
      .filter((scene) => LIGHT_SCENES.has(scene))
      .map((scene): Cell => ({ scene, theme: "light" })),
  ];
}

// ─── Concurrency pool ─────────────────────────────────────────────────────────

/**
 * Run `cells` through `worker` with at most `concurrency` in flight. Each
 * completed cell's returned filename is logged with running progress.
 */
export async function runPool(
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
