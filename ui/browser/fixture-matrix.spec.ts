import { test, expect, type Page } from "@playwright/test";
import { setTheme, waitForStore } from "./helpers/inject";
import {
  SCENES,
  SUPPORTED_WIDTHS,
  applyScene,
  dragListPaneTo,
  listScenes,
  waitForSceneHarness,
} from "./helpers/scenes";

const LIST_MIN_PX = 26;
const INSPECTOR_MIN_PX = 30;

// Console/page-error noise we don't care about (e.g. missing favicon on the
// stubbed dev page). Everything else is treated as a regression.
const IGNORED_CONSOLE = [/favicon/i];

let consoleErrors: string[] = [];
let pageErrors: string[] = [];

function attachErrorCapture(page: Page) {
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (IGNORED_CONSOLE.some((re) => re.test(text))) return;
    consoleErrors.push(text);
  });
  page.on("pageerror", (err) => pageErrors.push(String(err)));
}

test.beforeEach(async ({ page }) => {
  consoleErrors = [];
  pageErrors = [];
  attachErrorCapture(page);

  // Empty services → AppShell never opens a live SSE subscription, so the
  // scene-driven `connection` stays deterministic.
  await page.route("**/info", (route) =>
    route.fulfill({ json: { services: [] } }),
  );

  await page.goto("/");
  await waitForStore(page);
  await waitForSceneHarness(page);
});

function expectNoErrors(label: string) {
  expect(pageErrors, `${label}: uncaught page errors`).toEqual([]);
  expect(consoleErrors, `${label}: console errors`).toEqual([]);
}

test.describe("Fixture matrix", () => {
  test("harness exposes every scene in matrix order", async ({ page }) => {
    const live = (await listScenes(page)).map((s) => s.id);
    expect(live).toEqual(SCENES.map((s) => s.id));
  });

  // Every scene renders at every supported width with no console errors and
  // both panes present. This is the breadth check the review subagent relies
  // on; targeted visual assertions live in the per-feature specs.
  for (const scene of SCENES) {
    test(`scene "${scene.id}" renders at all supported widths`, async ({
      page,
    }) => {
      for (const width of SUPPORTED_WIDTHS) {
        await page.setViewportSize({ width, height: 900 });
        await applyScene(page, scene.id);

        const label = `${scene.id}@${width}`;

        // Both panels mount.
        await expect(
          page.locator("[data-panel]"),
          `${label}: both panes present`,
        ).toHaveCount(2);
        // List toolbar always renders.
        await expect(page.getByText("Requests").first()).toBeVisible();

        // Scene-specific signal that injection actually took effect.
        if (scene.id === "empty") {
          await expect(page.getByText("No requests yet")).toBeVisible();
          await expect(page.getByText("connected")).toBeVisible();
        }
        if (scene.id === "loading") {
          // "loading" shows a connecting message (not "No requests yet")
          // because connection is "connecting" — the distinguishable affordance.
          await expect(page.getByText("Connecting to proxy…")).toBeVisible();
          await expect(
            page.getByRole("status", { name: "connecting…" }).first(),
          ).toBeVisible();
        }
        if (scene.id === "many-rows") {
          await expect(page.getByText("120 requests").first()).toBeVisible();
        }
        if (scene.id === "error-row" || scene.id === "error-midstream") {
          // The status cell carries the error treatment in both modes: "Error"
          // (no status) or "NNN ✕" (mid-stream), rendered via StatusCode with a
          // data-error marker in text-error. Locate it mode-agnostically.
          await expect(
            page.locator('[data-testid="status-code"][data-error]').first(),
          ).toBeVisible();
        }

        expectNoErrors(label);
      }
    });
  }

  test("list pane clamps to minSize when dragged narrow and grows when wide", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await applyScene(page, "selected");

    const minWidth = await dragListPaneTo(page, "min");
    const wideWidth = await dragListPaneTo(page, "wide");

    // The v2.4 scaffold uses pixel panel sizing. Dragging narrow clamps at the
    // list pixel floor; dragging wide grows until the inspector's pixel floor
    // takes over.
    const groupBox = await page
      .locator('[data-slot="resizable-panel-group"]')
      .boundingBox();
    expect(groupBox).not.toBeNull();
    expect(minWidth).toBeGreaterThanOrEqual(LIST_MIN_PX - 5);
    expect(minWidth).toBeLessThan(LIST_MIN_PX + 20);
    expect(wideWidth).toBeGreaterThan(minWidth + 200);
    expect(wideWidth).toBeLessThanOrEqual(
      groupBox!.width - INSPECTOR_MIN_PX + 15,
    );

    expectNoErrors("list-pane-resize");
  });

  test("dual-size scene shows the wire size + compression marker with a tooltip", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await applyScene(page, "dual-size");

    // 66 wire bytes → 58 decoded bytes, gzip. Table view (the default) shows
    // the wire size inline with a compression marker; the wire/decoded
    // breakdown lives in the cell tooltip.
    const sizeCell = page
      .locator("button[role='option']")
      .first()
      .locator(":scope > span")
      .nth(4);
    await expect(sizeCell.getByText("66 B")).toBeVisible();
    await expect(sizeCell.locator("svg")).toBeVisible();
    await expect(sizeCell).toHaveAttribute(
      "title",
      /66B on the wire \/ 58B after decompression \(gzip\)/,
    );
    expectNoErrors("dual-size");
  });

  test("Light renders the matrix backdrop without errors", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await applyScene(page, "selected");
    await setTheme(page, "light");

    await expect(page.locator("html")).not.toHaveClass(/\bdark\b/);
    await expect(page.getByText("Requests").first()).toBeVisible();
    expectNoErrors("light-mode");
  });
});
