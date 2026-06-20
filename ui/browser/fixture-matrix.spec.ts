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

        // Both panels mount. Use direct-child chain from <main> to scope to
        // the outer list/inspector split; the body-split panels are nested
        // inside the inspector panel and are not direct children of [data-group].
        await expect(
          page.locator("main > [data-group] > [data-panel]"),
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
          // The 300ms delay means assertions use Playwright's built-in retry.
          await expect(page.getByText("Connecting to proxy…")).toBeVisible();
          // Verify the EmptyState connecting variant itself, not just ConnectionDot.
          await expect(page.getByTestId("connecting-state")).toBeVisible();
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
        if (scene.id === "cmdk-open") {
          // CommandPalette: check the input and two distinct command groups
          // (the backdrop carries two traces so "Jump to trace" is populated).
          await expect(page.getByPlaceholder("Run a command…")).toBeVisible();
          await expect(page.getByText("Jump to trace").first()).toBeVisible();
          await expect(page.getByText("Theme").first()).toBeVisible();
        }
        if (scene.id === "help-open") {
          await expect(
            page.getByRole("dialog").filter({ hasText: "Keyboard shortcuts" }),
          ).toBeVisible();
          await expect(page.getByText("Navigate").first()).toBeVisible();
          await expect(page.getByText("View").first()).toBeVisible();
        }
        if (scene.id === "ndjson-text") {
          // Body mode selector shows Tree/Text/Hex; Text should be active.
          // Radix ToggleGroup (single) renders items as role="radio".
          // Wait for the selector to appear (BodyModeSelector mounts only after
          // useDecodeBody's async Promise resolves), then check data-state.
          const textOption = page
            .getByRole("group", { name: "Body view mode" })
            .getByRole("radio", { name: "Text" })
            .first();
          await expect(textOption).toBeVisible();
          await expect(textOption).toHaveAttribute("data-state", "on");
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
    // Scope to the outer list/inspector panel group via the direct-child chain.
    const groupBox = await page
      .locator("main > [data-slot='resizable-panel-group']")
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
    // The dual-size scene leaves the (now rows) default mode; this test asserts
    // the table Size cell, so switch to table view.
    await page.getByLabel("Table view").click();

    // 66 wire bytes → 58 decoded bytes, gzip. Table view shows the wire size
    // inline with a compression marker; the wire/decoded breakdown lives in the
    // cell tooltip.
    const sizeCell = page
      .locator("button[role='option']")
      .first()
      .locator(":scope > span")
      .nth(4);
    await expect(sizeCell.getByText("66 B")).toBeVisible();
    await expect(sizeCell.locator("svg")).toBeVisible();
    await expect(sizeCell).toHaveAttribute(
      "title",
      /66 B on the wire \/ 58 B after decompression \(gzip\)/,
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
