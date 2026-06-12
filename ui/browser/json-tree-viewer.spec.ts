import { test, expect, type ConsoleMessage } from "@playwright/test";

// Drives the dev/test-only standalone harness (`#json-tree-harness`, mounted by
// main.tsx) so these assertions exercise the REAL production code path — the
// @tanstack/react-virtual virtualizer and its dynamic `measureElement` in a real
// browser, which the jsdom component tests cannot. See docs/agents/testing.md,
// "Test the real production code path".

function collectErrors(page: import("@playwright/test").Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg: ConsoleMessage) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(err.message));
  return errors;
}

test.describe("JsonTreeViewer harness", () => {
  test("opens an ES response with hit content visible by default", async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await page.goto("/#json-tree-harness");

    const viewer = page.getByLabel("JSON tree viewer");
    await expect(viewer).toBeVisible();

    // The ES fixture is the default. `hits.hits[]._source` content must be
    // visible without any manual expansion (the ticket's headline Done-when).
    await expect(viewer).toContainText("_source");
    await expect(viewer).toContainText("Product 0");

    // The large aggregation bucket array (>100 children would collapse; this one
    // is small) and nested structure render with count badges somewhere.
    expect(errors).toEqual([]);
  });

  test("collapses and re-expands via the root toggle", async ({ page }) => {
    await page.goto("/#json-tree-harness");
    const viewer = page.getByLabel("JSON tree viewer");
    await expect(viewer).toContainText("took");

    // First disclosure button is the root toggle.
    const rootToggle = viewer.getByRole("button").first();
    await rootToggle.click();
    await expect(viewer).not.toContainText("took");
    // Collapsed root shows a key-count badge.
    await expect(viewer).toContainText(/\d+ keys/);

    await rootToggle.click();
    await expect(viewer).toContainText("took");
  });

  test("measures real row heights (dynamic measurement path)", async ({
    page,
  }) => {
    await page.goto("/#json-tree-harness");
    const viewer = page.getByLabel("JSON tree viewer");
    await expect(viewer).toBeVisible();

    const firstRow = viewer.locator("[data-index='0']");
    const box = await firstRow.boundingBox();
    expect(box).not.toBeNull();
    // A real browser measures a non-zero height; jsdom would report 0.
    expect(box!.height).toBeGreaterThan(0);
  });

  test("scrolls horizontally for deeply nested content", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 720 });
    await page.goto("/#json-tree-harness");

    // Switch to the deeply-nested fixture, whose deepest row overflows 360px.
    await page.getByTestId("fixture-deep").click();
    const viewer = page.getByLabel("JSON tree viewer");
    await expect(viewer).toContainText("buried deep");

    const scrolled = await viewer.evaluate((el) => {
      el.scrollLeft = 9999;
      return el.scrollLeft;
    });
    expect(scrolled).toBeGreaterThan(0);
  });

  test("renders without console errors after a theme toggle", async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await page.goto("/#json-tree-harness");
    await expect(page.getByLabel("JSON tree viewer")).toBeVisible();

    await page.getByTestId("toggle-theme").click();
    await expect(page.locator("html")).toHaveClass(/dark/);
    await expect(page.getByLabel("JSON tree viewer")).toContainText("_source");

    expect(errors).toEqual([]);
  });
});
