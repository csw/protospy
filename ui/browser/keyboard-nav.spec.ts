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
// Keyboard navigation
// ---------------------------------------------------------------------------

test.describe("Keyboard navigation", () => {
  test("j moves selection to next exchange", async ({ page }) => {
    // Inject 3 exchanges with distinct timestamps so sort order is stable.
    // Newest-first: ordered = [/third, /second, /first]
    await injectExchanges(page, [
      ...makeCompleteExchange(1, "GET", "/first", "200 OK", {
        ts: "2024-01-01T00:00:01Z",
      }),
      ...makeCompleteExchange(2, "GET", "/second", "200 OK", {
        ts: "2024-01-01T00:00:02Z",
      }),
      ...makeCompleteExchange(3, "GET", "/third", "200 OK", {
        ts: "2024-01-01T00:00:03Z",
      }),
    ]);

    // Click the first visible row (/third) to establish selection
    await page.getByText("/third").first().click();
    await expect(
      page.locator("button[aria-selected='true']").first(),
    ).toHaveText(/\/third/);

    // j should move selection to the next row (/second)
    await page.keyboard.press("j");
    await expect(
      page.locator("button[aria-selected='true']").first(),
    ).toHaveText(/\/second/);
  });

  test("ArrowDown moves selection to next exchange", async ({ page }) => {
    await injectExchanges(page, [
      ...makeCompleteExchange(1, "GET", "/first", "200 OK", {
        ts: "2024-01-01T00:00:01Z",
      }),
      ...makeCompleteExchange(2, "GET", "/second", "200 OK", {
        ts: "2024-01-01T00:00:02Z",
      }),
    ]);

    // Click /second (first visible, newest-first)
    await page.getByText("/second").first().click();
    await expect(
      page.locator("button[aria-selected='true']").first(),
    ).toHaveText(/\/second/);

    // ArrowDown should move to /first
    await page.keyboard.press("ArrowDown");
    await expect(
      page.locator("button[aria-selected='true']").first(),
    ).toHaveText(/\/first/);
  });

  test("k moves selection to previous exchange", async ({ page }) => {
    // Newest-first: ordered = [/third, /second, /first]
    await injectExchanges(page, [
      ...makeCompleteExchange(1, "GET", "/first", "200 OK", {
        ts: "2024-01-01T00:00:01Z",
      }),
      ...makeCompleteExchange(2, "GET", "/second", "200 OK", {
        ts: "2024-01-01T00:00:02Z",
      }),
      ...makeCompleteExchange(3, "GET", "/third", "200 OK", {
        ts: "2024-01-01T00:00:03Z",
      }),
    ]);

    // Start on /second (middle row)
    await page.getByText("/second").first().click();
    await expect(
      page.locator("button[aria-selected='true']").first(),
    ).toHaveText(/\/second/);

    // k should move to /third (previous in newest-first order)
    await page.keyboard.press("k");
    await expect(
      page.locator("button[aria-selected='true']").first(),
    ).toHaveText(/\/third/);
  });

  test("ArrowUp moves selection to previous exchange", async ({ page }) => {
    await injectExchanges(page, [
      ...makeCompleteExchange(1, "GET", "/first", "200 OK", {
        ts: "2024-01-01T00:00:01Z",
      }),
      ...makeCompleteExchange(2, "GET", "/second", "200 OK", {
        ts: "2024-01-01T00:00:02Z",
      }),
    ]);

    // Start on /first (last row in newest-first order)
    await page.getByText("/first").first().click();
    await expect(
      page.locator("button[aria-selected='true']").first(),
    ).toHaveText(/\/first/);

    // ArrowUp should move to /second
    await page.keyboard.press("ArrowUp");
    await expect(
      page.locator("button[aria-selected='true']").first(),
    ).toHaveText(/\/second/);
  });

  test("k on first item stays on first item", async ({ page }) => {
    // Newest-first: ordered = [/second, /first]; /second is ordered[0]
    await injectExchanges(page, [
      ...makeCompleteExchange(1, "GET", "/first", "200 OK", {
        ts: "2024-01-01T00:00:01Z",
      }),
      ...makeCompleteExchange(2, "GET", "/second", "200 OK", {
        ts: "2024-01-01T00:00:02Z",
      }),
    ]);

    // Click the topmost row (/second)
    await page.getByText("/second").first().click();
    await expect(
      page.locator("button[aria-selected='true']").first(),
    ).toHaveText(/\/second/);

    // k at the top should be a no-op
    await page.keyboard.press("k");
    await expect(
      page.locator("button[aria-selected='true']").first(),
    ).toHaveText(/\/second/);
  });

  test("j on last item stays on last item", async ({ page }) => {
    // Newest-first: ordered = [/second, /first]; /first is ordered[1] (last)
    await injectExchanges(page, [
      ...makeCompleteExchange(1, "GET", "/first", "200 OK", {
        ts: "2024-01-01T00:00:01Z",
      }),
      ...makeCompleteExchange(2, "GET", "/second", "200 OK", {
        ts: "2024-01-01T00:00:02Z",
      }),
    ]);

    // Click the bottommost row (/first)
    await page.getByText("/first").first().click();
    await expect(
      page.locator("button[aria-selected='true']").first(),
    ).toHaveText(/\/first/);

    // j at the bottom should be a no-op
    await page.keyboard.press("j");
    await expect(
      page.locator("button[aria-selected='true']").first(),
    ).toHaveText(/\/first/);
  });

  test("navigation respects active filter", async ({ page }) => {
    // Inject 3 exchanges; /hidden will not match the filter
    await injectExchanges(page, [
      ...makeCompleteExchange(1, "GET", "/api/alpha", "200 OK", {
        ts: "2024-01-01T00:00:01Z",
      }),
      ...makeCompleteExchange(2, "GET", "/hidden", "200 OK", {
        ts: "2024-01-01T00:00:02Z",
      }),
      ...makeCompleteExchange(3, "GET", "/api/gamma", "200 OK", {
        ts: "2024-01-01T00:00:03Z",
      }),
    ]);

    // Type "/api" into the filter input — only /api/gamma and /api/alpha remain
    const filterInput = page.getByPlaceholder("Filter exchanges…");
    await filterInput.fill("/api");

    // Blur the filter input so j/k are not swallowed
    await filterInput.blur();

    // Verify /hidden is gone from the list
    await expect(page.getByText("/hidden")).not.toBeVisible();

    // With filter active, newest-first: ordered = [/api/gamma, /api/alpha]
    // Click /api/gamma (top of filtered list)
    await page.getByText("/api/gamma").first().click();
    await expect(
      page.locator("button[aria-selected='true']").first(),
    ).toHaveText(/\/api\/gamma/);

    // j moves to /api/alpha (next in filtered list, skipping /hidden)
    await page.keyboard.press("j");
    await expect(
      page.locator("button[aria-selected='true']").first(),
    ).toHaveText(/\/api\/alpha/);

    // j again at the bottom — no-op
    await page.keyboard.press("j");
    await expect(
      page.locator("button[aria-selected='true']").first(),
    ).toHaveText(/\/api\/alpha/);
  });

  test("focus in filter input suppresses j/k navigation", async ({ page }) => {
    await injectExchanges(page, [
      ...makeCompleteExchange(1, "GET", "/api/test", "200 OK", {
        ts: "2024-01-01T00:00:01Z",
      }),
      ...makeCompleteExchange(2, "GET", "/api/other", "200 OK", {
        ts: "2024-01-01T00:00:02Z",
      }),
    ]);

    // Click a row to establish selection (newest-first: /api/other is first)
    await page.getByText("/api/other").first().click();

    // Focus the filter input
    const filterInput = page.getByPlaceholder("Filter exchanges…");
    await filterInput.click();

    // Press j — should type "j" into the input, not move selection
    await page.keyboard.press("j");
    await expect(filterInput).toHaveValue("j");

    // Selection should be unchanged — /api/other row still selected
    // Use getStoreState to check selection didn't change, avoiding tab trigger ambiguity
    const selectedId = await getStoreState(page, "selectedId");
    expect(selectedId).toBe(2);
  });

  test("Meta+k opens command palette", async ({ page }) => {
    await page.keyboard.press("Meta+k");

    // The command palette input should become visible
    await expect(page.getByPlaceholder("Search...")).toBeVisible();
  });
});
