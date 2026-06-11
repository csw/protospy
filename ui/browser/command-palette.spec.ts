import { test, expect } from "@playwright/test";
import {
  resetStore,
  waitForStore,
  getStoreState,
  getThemePreference,
  injectExchanges,
} from "./helpers/inject";
import { makeCompleteExchange } from "./fixtures/exchanges";

test.beforeEach(async ({ page }) => {
  await page.route("**/info", (route) =>
    route.fulfill({ json: { services: [{ name: "test-backend" }] } }),
  );
  await page.route("**/service/test-backend/events", (route) =>
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
    await expect(page.getByPlaceholder("Run a command…")).toBeVisible();
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
  test("2.1 selecting a theme option sets the theme preference", async ({
    page,
  }) => {
    await page.keyboard.press("Meta+k");
    await page.getByRole("option", { name: /Light/i }).click();

    // Palette closes after selection
    await expect(page.getByRole("dialog")).not.toBeVisible();

    expect(await getThemePreference(page)).toBe("light");
  });

  test("2.2 toggle density changes store density state", async ({ page }) => {
    const before = await getStoreState(page, "density");
    expect(before).toBe("regular");

    await page.keyboard.press("Meta+k");
    await page.getByRole("option", { name: /Compact density/i }).click();

    await expect(page.getByRole("dialog")).not.toBeVisible();

    const after = await getStoreState(page, "density");
    expect(after).toBe("compact");
  });

  test("2.3 switch to rows view then back to table via palette", async ({
    page,
  }) => {
    await injectExchanges(page, [
      ...makeCompleteExchange(1, "GET", "/api/table", "200 OK"),
    ]);

    // Default is table mode; switch to rows, then verify switching back
    // to table via the palette restores table headers.
    await page.keyboard.press("Meta+k");
    await page.getByRole("option", { name: /switch to rows view/i }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();

    // Table headers should be gone in rows mode
    await expect(page.getByTestId("exchange-table-header")).not.toBeVisible();

    // Now switch back to table mode via palette
    await page.keyboard.press("Meta+k");
    await page.getByRole("option", { name: /switch to table view/i }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();

    // Table headers are visible again
    await expect(page.getByText("Method")).toBeVisible();
    await expect(page.getByText("Status")).toBeVisible();
    await expect(page.getByText("Path")).toBeVisible();
  });

  test("2.4 Group by trace changes store traceGroupOn state", async ({
    page,
  }) => {
    const before = await getStoreState(page, "traceGroupOn");
    expect(before).toBe(false);

    await page.keyboard.press("Meta+k");
    await page.getByRole("option", { name: /Group by trace/i }).click();

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
