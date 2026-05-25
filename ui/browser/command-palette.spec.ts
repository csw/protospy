import { test, expect } from "@playwright/test";
import { resetStore, waitForStore, getStoreState } from "./helpers/inject";

test.beforeEach(async ({ page }) => {
  await page.route("**/info", (route) =>
    route.fulfill({ json: { services: [{ name: "test-backend" }] } }),
  );
  await page.route("**/service/test-backend", (route) =>
    route.fulfill({ contentType: "text/event-stream", body: "" }),
  );
  await page.goto("/");
  await waitForStore(page);
  await resetStore(page);
});

// ---------------------------------------------------------------------------
// 1. Open / close
// ---------------------------------------------------------------------------

test.describe("Command palette — open/close", () => {
  test("1.1 opens with Cmd+K and shows search placeholder", async ({
    page,
  }) => {
    await page.keyboard.press("Meta+k");
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByPlaceholder("Search commands…")).toBeVisible();
  });

  test("1.2 closes with Escape", async ({ page }) => {
    await page.keyboard.press("Meta+k");
    await expect(page.getByRole("dialog")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).not.toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// 2. Commands
// ---------------------------------------------------------------------------

test.describe("Command palette — commands", () => {
  test("2.1 toggle dark mode changes store darkMode state", async ({
    page,
  }) => {
    const before = await getStoreState(page, "darkMode");

    await page.keyboard.press("Meta+k");
    await page.getByRole("option", { name: /toggle dark mode/i }).click();

    // Palette closes after selection
    await expect(page.getByRole("dialog")).not.toBeVisible();

    const after = await getStoreState(page, "darkMode");
    expect(after).toBe(!before);
  });

  test("2.2 toggle density changes store density state", async ({ page }) => {
    const before = await getStoreState(page, "density");
    expect(before).toBe("regular");

    await page.keyboard.press("Meta+k");
    await page.getByRole("option", { name: /toggle density/i }).click();

    await expect(page.getByRole("dialog")).not.toBeVisible();

    const after = await getStoreState(page, "density");
    expect(after).toBe("compact");
  });

  test("2.3 switch to table view shows table headers", async ({ page }) => {
    await page.keyboard.press("Meta+k");
    await page.getByRole("option", { name: /switch to table view/i }).click();

    await expect(page.getByRole("dialog")).not.toBeVisible();

    // Table headers are visible after switching to table mode
    await expect(page.getByText("Method")).toBeVisible();
    await expect(page.getByText("Status")).toBeVisible();
    await expect(page.getByText("Path")).toBeVisible();
    await expect(page.getByText("Time")).toBeVisible();
    await expect(page.getByText("Size")).toBeVisible();
    await expect(page.getByText("When", { exact: true })).toBeVisible();
  });

  test("2.4 toggle trace grouping changes store traceGroupOn state", async ({
    page,
  }) => {
    const before = await getStoreState(page, "traceGroupOn");
    expect(before).toBe(false);

    await page.keyboard.press("Meta+k");
    await page.getByRole("option", { name: /toggle trace grouping/i }).click();

    await expect(page.getByRole("dialog")).not.toBeVisible();

    const after = await getStoreState(page, "traceGroupOn");
    expect(after).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3. Clear filter command
// ---------------------------------------------------------------------------

test.describe("Command palette — clear filter", () => {
  test("3.1 clear filter command appears when filter is set and resets it", async ({
    page,
  }) => {
    // Set a filter directly in the store
    await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const store = (window as any).__test_store;
      store.getState().setFilter("beta");
    });

    await page.keyboard.press("Meta+k");
    await expect(page.getByRole("dialog")).toBeVisible();

    // The clear filter command should be present when filter is set
    await expect(
      page.getByRole("option", { name: /clear filter/i }),
    ).toBeVisible();

    // Click the clear filter command
    await page.getByRole("option", { name: /clear filter/i }).click();

    // Palette should close after selection
    await expect(page.getByRole("dialog")).not.toBeVisible();

    // Filter should be cleared in the store
    const filter = await getStoreState(page, "filter");
    expect(filter).toBe("");
  });

  test("3.2 clear filter command is absent when no filter is active", async ({
    page,
  }) => {
    await page.keyboard.press("Meta+k");
    await expect(page.getByRole("dialog")).toBeVisible();

    // With no filter set, the clear filter command should not appear
    await expect(
      page.getByRole("option", { name: /clear filter/i }),
    ).not.toBeVisible();
  });
});
