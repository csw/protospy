import { test, expect } from "@playwright/test";
import { injectExchanges, resetStore, waitForStore } from "./helpers/inject";
import { makeGetRequest, makeResponse } from "./fixtures/exchanges";

test.beforeEach(async ({ page }) => {
  await page.route("**/info", (route) =>
    route.fulfill({
      json: { services: [{ name: "test-backend" }] },
    }),
  );
  await page.route("**/service/test-backend", (route) =>
    route.fulfill({
      contentType: "text/event-stream",
      body: "",
    }),
  );
  await page.goto("/");
  await waitForStore(page);
  await resetStore(page);
});

test.describe("Absolute timestamps (table mode)", () => {
  test("table mode shows absolute timestamp with millisecond resolution", async ({
    page,
  }) => {
    // Use a stable UTC timestamp so we can assert exact text in UTC mode.
    const ts = "2024-06-01T12:34:56.789Z";
    await injectExchanges(page, [
      makeGetRequest(1, "/api/test", ts),
      makeResponse(1, "200 OK"),
    ]);

    // Default mode is table; switch to UTC so we can assert exact output.
    await page
      .getByLabel(/Time zone: local\. Click to toggle/)
      .first()
      .click();

    const cell = page.locator('[data-testid="exchange-when"]').first();
    await expect(cell).toHaveText("12:34:56.789");
  });

  test("toggling the When header switches local <-> UTC", async ({ page }) => {
    const ts = "2024-06-01T12:34:56.789Z";
    await injectExchanges(page, [
      makeGetRequest(1, "/api/test", ts),
      makeResponse(1, "200 OK"),
    ]);

    const header = page.getByLabel(/Time zone:/).first();
    await expect(header).toHaveText(/^When \(local\)$/);

    // First click → UTC
    await header.click();
    await expect(header).toHaveText(/^When \(UTC\)$/);
    const cell = page.locator('[data-testid="exchange-when"]').first();
    await expect(cell).toHaveText("12:34:56.789");

    // Click again → back to local
    await header.click();
    await expect(header).toHaveText(/^When \(local\)$/);
  });

  test("timestamp cell exposes both local and UTC in the tooltip", async ({
    page,
  }) => {
    const ts = "2024-06-01T12:34:56.789Z";
    await injectExchanges(page, [
      makeGetRequest(1, "/api/test", ts),
      makeResponse(1, "200 OK"),
    ]);

    const cell = page.locator('[data-testid="exchange-when"]').first();
    const title = await cell.getAttribute("title");
    expect(title).toMatch(
      /^\d{2}:\d{2}:\d{2}\.\d{3} local · 12:34:56\.789 UTC$/,
    );
  });
});
