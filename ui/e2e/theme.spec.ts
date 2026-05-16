import { test, expect } from "@playwright/test";
import { injectExchanges, resetStore, waitForStore } from "./helpers/inject";
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
// 1. Theme toggle
// ---------------------------------------------------------------------------

test.describe("Theme toggle", () => {
  test("1.1 default theme is light", async ({ page }) => {
    const theme = await page.evaluate(() =>
      document.documentElement.getAttribute("data-theme"),
    );
    expect(theme).toBe("light");
  });

  test("1.2 toggle to dark mode via command palette", async ({ page }) => {
    await page.keyboard.press("Meta+k");
    await page.getByText("Toggle dark mode").click();

    const theme = await page.evaluate(() =>
      document.documentElement.getAttribute("data-theme"),
    );
    expect(theme).toBe("dark");
  });

  test("1.3 toggle back to light mode by toggling twice", async ({ page }) => {
    // First toggle: light → dark
    await page.keyboard.press("Meta+k");
    await page.getByText("Toggle dark mode").click();

    // Second toggle: dark → light (palette closes after each selection)
    await page.keyboard.press("Meta+k");
    await page.getByText("Toggle dark mode").click();

    const theme = await page.evaluate(() =>
      document.documentElement.getAttribute("data-theme"),
    );
    expect(theme).toBe("light");
  });
});

// ---------------------------------------------------------------------------
// 2. Status text colors
// ---------------------------------------------------------------------------

test.describe("Status text colors", () => {
  test("2.1 2xx status renders green", async ({ page }) => {
    await injectExchanges(page, [
      ...makeCompleteExchange(1, "GET", "/api/ok", "200 OK"),
    ]);

    const status = page.getByText("200 OK").first();
    await expect(status).toBeVisible();

    const color = await status.evaluate((el) => getComputedStyle(el).color);

    // Parse rgb values and assert green channel dominates
    const m = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    expect(m).not.toBeNull();
    const [r, g, b] = [Number(m![1]), Number(m![2]), Number(m![3])];
    expect(g).toBeGreaterThan(r);
    expect(g).toBeGreaterThan(b);
  });

  test("2.2 5xx status renders red", async ({ page }) => {
    await injectExchanges(page, [
      ...makeCompleteExchange(
        1,
        "GET",
        "/api/fail",
        "500 Internal Server Error",
      ),
    ]);

    const status = page.getByText("500 Internal Server Error").first();
    await expect(status).toBeVisible();

    const color = await status.evaluate((el) => getComputedStyle(el).color);

    // Parse rgb values and assert red channel dominates
    const m = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    expect(m).not.toBeNull();
    const [r, g, b] = [Number(m![1]), Number(m![2]), Number(m![3])];
    expect(r).toBeGreaterThan(g);
    expect(r).toBeGreaterThan(b);
  });
});

// ---------------------------------------------------------------------------
// 3. Method badge colors
// ---------------------------------------------------------------------------

test.describe("Method badge colors", () => {
  test("3.1 GET and POST badges have distinct background colors", async ({
    page,
  }) => {
    await injectExchanges(page, [
      ...makeCompleteExchange(1, "GET", "/api/get", "200 OK", {
        ts: "2024-01-01T00:00:01Z",
      }),
      ...makeCompleteExchange(2, "POST", "/api/post", "201 Created", {
        ts: "2024-01-01T00:00:02Z",
      }),
    ]);

    // Locate the method badge spans by their exact text content
    const getBadge = page.locator("span", { hasText: /^GET$/ }).first();
    const postBadge = page.locator("span", { hasText: /^POST$/ }).first();

    await expect(getBadge).toBeVisible();
    await expect(postBadge).toBeVisible();

    const getBg = await getBadge.evaluate(
      (el) => getComputedStyle(el).backgroundColor,
    );
    const postBg = await postBadge.evaluate(
      (el) => getComputedStyle(el).backgroundColor,
    );

    // The two methods must have different background colors
    expect(getBg).not.toBe(postBg);
    // Neither should be transparent / unset
    expect(getBg).not.toBe("rgba(0, 0, 0, 0)");
    expect(postBg).not.toBe("rgba(0, 0, 0, 0)");
  });
});

// ---------------------------------------------------------------------------
// 4. Connection indicator
// ---------------------------------------------------------------------------

test.describe("Connection indicator", () => {
  test("4.1 status bar shows connecting state after reset", async ({
    page,
  }) => {
    // resetStore sets connection back to "connecting" (SSE mock returns empty body,
    // so the "open" event never fires)
    await expect(page.getByText("connecting")).toBeVisible();

    // The amber pulsing dot should be present — select by its bg-amber class
    const dot = page.locator(".bg-amber.animate-pulse").first();
    await expect(dot).toBeVisible();
  });

  test("4.2 status bar shows connected state when connection is open", async ({
    page,
  }) => {
    // Manually set connection state to "open" via the store
    await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const store = (window as any).__test_store;
      store.getState().setConnection("open");
    });

    await expect(page.getByText("connected")).toBeVisible();

    // The solid green dot (no animate-pulse)
    const dot = page.locator(".bg-green.rounded-full").first();
    await expect(dot).toBeVisible();
  });
});
