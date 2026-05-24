import { test, expect } from "@playwright/test";
import {
  injectExchanges,
  resetStore,
  waitForStore,
  getStoreState,
} from "./helpers/inject";
import { makeCompleteExchange } from "./fixtures/exchanges";

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
    await expect(page.getByPlaceholder("Search exchanges…")).toBeVisible();
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
// 3. Exchange search
// ---------------------------------------------------------------------------

test.describe("Command palette — exchange search", () => {
  test("3.1 injected exchanges appear in palette and selection closes palette and selects exchange", async ({
    page,
  }) => {
    await injectExchanges(page, [
      ...makeCompleteExchange(1, "GET", "/api/alpha", "200 OK", {
        ts: "2024-01-01T00:00:01Z",
      }),
      ...makeCompleteExchange(2, "POST", "/api/beta", "201 Created", {
        ts: "2024-01-01T00:00:02Z",
      }),
      ...makeCompleteExchange(3, "DELETE", "/api/gamma", "204 No Content", {
        ts: "2024-01-01T00:00:03Z",
      }),
    ]);

    await page.keyboard.press("Meta+k");
    await expect(page.getByRole("dialog")).toBeVisible();

    // Type a path fragment to filter exchanges
    await page.getByPlaceholder("Search exchanges…").fill("beta");

    // The matching exchange should appear
    await expect(
      page.getByRole("option", { name: /\/api\/beta/i }),
    ).toBeVisible();

    // Non-matching exchanges should not appear
    await expect(
      page.getByRole("option", { name: /\/api\/alpha/i }),
    ).not.toBeVisible();

    // Click the matching exchange to select it
    await page.getByRole("option", { name: /\/api\/beta/i }).click();

    // Palette should close
    await expect(page.getByRole("dialog")).not.toBeVisible();

    // Exchange 2 should now be selected in the store
    const selectedId = await getStoreState(page, "selectedId");
    expect(selectedId).toBe(2);
  });
});
