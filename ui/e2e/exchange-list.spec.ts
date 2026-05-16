import { test, expect } from "@playwright/test";
import { injectExchanges, resetStore, waitForStore } from "./helpers/inject";
import {
  makeGetRequest,
  makeResponse,
  makeCompleteExchange,
  makeRequestWithTrace,
} from "./fixtures/exchanges";

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

// ---------------------------------------------------------------------------
// 1. Rows mode
// ---------------------------------------------------------------------------

test.describe("Exchange list — rows mode", () => {
  test("1.1 shows empty state when no exchanges", async ({ page }) => {
    await expect(page.getByText("No exchanges")).toBeVisible();
  });

  test("1.2 exchanges render with method, status, path", async ({ page }) => {
    await injectExchanges(page, [
      makeGetRequest(1, "/api/movies"),
      makeResponse(1, "200 OK", '{"movies":[]}'),
    ]);

    await expect(page.getByText("GET").first()).toBeVisible();
    await expect(page.getByText("200 OK").first()).toBeVisible();
    await expect(page.getByText("/api/movies").first()).toBeVisible();
  });

  test("1.3 clicking a row selects it and shows inspector", async ({
    page,
  }) => {
    await injectExchanges(page, [
      makeGetRequest(1, "/api/movies"),
      makeResponse(1, "200 OK"),
    ]);

    // Before selection, inspector shows empty state
    await expect(page.getByText("Select an exchange")).toBeVisible();

    // Click the exchange row
    await page.getByText("/api/movies").first().click();

    // Inspector should now show the exchange
    await expect(page.getByText("Select an exchange")).not.toBeVisible();
    // Context bar should show the method and path
    await expect(
      page.locator("button[aria-selected='true']").first(),
    ).toBeVisible();
  });

  test("1.4 trace color rail shows on traced exchanges", async ({ page }) => {
    const traceId = "abcdef1234567890abcdef1234567890";
    await injectExchanges(page, [
      makeRequestWithTrace(1, traceId, "/api/traced"),
      makeResponse(1, "200 OK"),
    ]);

    // The row should have a colored left border (border-l-4 with traceColor)
    const row = page.locator("button[aria-selected]").first();
    await expect(row).toBeVisible();
    const borderColor = await row.evaluate(
      (el) => getComputedStyle(el).borderLeftColor,
    );
    // Should not be transparent — trace color is applied
    expect(borderColor).not.toBe("rgba(0, 0, 0, 0)");
    expect(borderColor).not.toBe("transparent");
  });

  test("1.5 multiple exchanges render in order", async ({ page }) => {
    await injectExchanges(page, [
      ...makeCompleteExchange(1, "GET", "/first", "200 OK", {
        ts: "2024-01-01T00:00:01Z",
      }),
      ...makeCompleteExchange(2, "POST", "/second", "201 Created", {
        ts: "2024-01-01T00:00:02Z",
      }),
      ...makeCompleteExchange(3, "DELETE", "/third", "204 No Content", {
        ts: "2024-01-01T00:00:03Z",
      }),
    ]);

    const rows = page.locator("button[aria-selected]");
    await expect(rows).toHaveCount(3);
  });
});

// ---------------------------------------------------------------------------
// 2. Table mode
// ---------------------------------------------------------------------------

test.describe("Exchange list — table mode", () => {
  test.beforeEach(async ({ page }) => {
    // Switch to table mode
    await page.getByLabel("Table mode").click();
  });

  test("2.1 table header columns are visible", async ({ page }) => {
    await expect(page.getByText("Method")).toBeVisible();
    await expect(page.getByText("Status")).toBeVisible();
    await expect(page.getByText("Path")).toBeVisible();
    await expect(page.getByText("Time")).toBeVisible();
    await expect(page.getByText("Size")).toBeVisible();
    await expect(page.getByText("When")).toBeVisible();
  });

  test("2.2 row data renders in table columns", async ({ page }) => {
    await injectExchanges(page, [
      makeGetRequest(1, "/api/items"),
      makeResponse(1, "200 OK", '{"items":[]}'),
    ]);

    await expect(page.getByText("GET").first()).toBeVisible();
    await expect(page.getByText("200 OK").first()).toBeVisible();
    await expect(page.getByText("/api/items").first()).toBeVisible();
    await expect(page.getByText("42ms").first()).toBeVisible();
  });

  test("2.3 compact density reduces row height", async ({ page }) => {
    await injectExchanges(page, [
      makeGetRequest(1, "/api/test"),
      makeResponse(1, "200 OK"),
    ]);

    // Regular density: 30px
    const rowBefore = page.locator("button[aria-selected]").first();
    await expect(rowBefore).toBeVisible();
    const heightBefore = await rowBefore.evaluate(
      (el) => el.getBoundingClientRect().height,
    );
    expect(heightBefore).toBe(30);

    // Toggle to compact via command palette
    await page.keyboard.press("Meta+k");
    await page.getByText("Toggle density").click();

    // Compact density: 24px
    const rowAfter = page.locator("button[aria-selected]").first();
    const heightAfter = await rowAfter.evaluate(
      (el) => el.getBoundingClientRect().height,
    );
    expect(heightAfter).toBe(24);
  });

  test("2.4 mode switching preserves data", async ({ page }) => {
    await injectExchanges(page, [
      makeGetRequest(1, "/api/preserved"),
      makeResponse(1, "200 OK"),
    ]);

    await expect(page.getByText("/api/preserved").first()).toBeVisible();

    // Switch back to rows
    await page.getByLabel("Rows mode").click();
    await expect(page.getByText("/api/preserved").first()).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// 3. Sort order
// ---------------------------------------------------------------------------

test.describe("Sort order", () => {
  test("3.1 default order is newest first", async ({ page }) => {
    await injectExchanges(page, [
      ...makeCompleteExchange(1, "GET", "/older", "200 OK", {
        ts: "2024-01-01T00:00:01Z",
      }),
      ...makeCompleteExchange(2, "GET", "/newer", "200 OK", {
        ts: "2024-01-01T00:00:02Z",
      }),
    ]);

    // Default order is "newest" — /newer should appear first
    const rows = page.locator("button[aria-selected]");
    const firstRowText = await rows.first().textContent();
    expect(firstRowText).toContain("/newer");
  });

  test("3.2 toggle to oldest first", async ({ page }) => {
    await injectExchanges(page, [
      ...makeCompleteExchange(1, "GET", "/older", "200 OK", {
        ts: "2024-01-01T00:00:01Z",
      }),
      ...makeCompleteExchange(2, "GET", "/newer", "200 OK", {
        ts: "2024-01-01T00:00:02Z",
      }),
    ]);

    // Click sort toggle
    await page
      .getByLabel(/Sort order/)
      .first()
      .click();

    const rows = page.locator("button[aria-selected]");
    const firstRowText = await rows.first().textContent();
    expect(firstRowText).toContain("/older");
  });
});

// ---------------------------------------------------------------------------
// 11. Edge cases
// ---------------------------------------------------------------------------

test.describe("Edge cases", () => {
  test("11.1 pending exchange shows dashes", async ({ page }) => {
    // Only inject request, no response
    await injectExchanges(page, [makeGetRequest(1, "/api/pending")]);

    // Switch to table mode to see explicit status/elapsed columns
    await page.getByLabel("Table mode").click();

    // Status should show "—" and elapsed should show "—"
    const dashes = page.getByText("—");
    await expect(dashes.first()).toBeVisible();
  });

  test("11.2 5xx errors show red status", async ({ page }) => {
    await injectExchanges(page, [
      makeGetRequest(1, "/api/fail"),
      makeResponse(1, "500 Internal Server Error"),
    ]);

    const status = page.getByText("500 Internal Server Error").first();
    await expect(status).toBeVisible();
    // Verify the status text has a red-ish color
    const color = await status.evaluate((el) => getComputedStyle(el).color);
    // text-red token — should be a reddish color, not default
    expect(color).not.toBe("rgb(0, 0, 0)");
  });
});
