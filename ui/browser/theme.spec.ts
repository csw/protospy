import { test, expect } from "@playwright/test";
import {
  getResolvedTheme,
  getThemePreference,
  injectExchanges,
  resetStore,
  setTheme,
  waitForStore,
} from "./helpers/inject";
import { makeCompleteExchange } from "./fixtures/exchanges";

test.beforeEach(async ({ page }) => {
  await page.route("**/info", (route) =>
    route.fulfill({ json: { services: [{ name: "test-backend" }] } }),
  );
  await page.route("**/service/test-backend/events", async () => {
    // Park the SSE connection: never fulfill, so EventSource stays in
    // CONNECTING and the reconnect cycle never fires. This prevents the
    // reconnect logic from overwriting store state that tests set manually
    // (e.g. test 4.2 sets connection: "open" via the store).
    await new Promise<void>(() => {});
  });
  await page.goto("/");
  await waitForStore(page);
  await resetStore(page);
});

// ---------------------------------------------------------------------------
// 1. Theme preference
// ---------------------------------------------------------------------------

test.describe("Theme preference", () => {
  test("1.1 default theme resolves to a valid applied theme", async ({
    page,
  }) => {
    // DEFAULT_THEME is 'system' in tests (no ?defaultTheme= param), which
    // resolves to 'dark' or 'light' depending on the OS. Just verify a
    // valid resolved theme is applied to <html> (next-themes .dark class).
    expect(["dark", "light"]).toContain(await getResolvedTheme(page));
  });

  test("1.2 set Light via command palette", async ({ page }) => {
    await page.keyboard.press("Meta+k");
    await page.getByText("Light").click();

    await expect(page.locator("html")).not.toHaveClass(/\bdark\b/);
    expect(await getThemePreference(page)).toBe("light");
  });

  test("1.3 set Dark via command palette", async ({ page }) => {
    // Start from light to verify the switch
    await setTheme(page, "light");
    await expect(page.locator("html")).not.toHaveClass(/\bdark\b/);

    await page.keyboard.press("Meta+k");
    await page.getByText("Dark").click();

    await expect(page.locator("html")).toHaveClass(/\bdark\b/);
    expect(await getThemePreference(page)).toBe("dark");
  });

  test("1.4 set system mode via command palette", async ({ page }) => {
    await page.keyboard.press("Meta+k");
    await page.getByText("System").click();

    expect(await getThemePreference(page)).toBe("system");
    // Resolved theme should follow the OS preference (dark or light).
    expect(["dark", "light"]).toContain(await getResolvedTheme(page));
  });

  test("1.5 theme cycle via TopBar button: dark → system → light", async ({
    page,
  }) => {
    // Start at dark
    await setTheme(page, "dark");

    // Click the theme button (has aria-label containing "Theme:")
    const themeBtn = page.locator('button[aria-label^="Theme:"]');
    await themeBtn.click();
    expect(await getThemePreference(page)).toBe("system");

    await themeBtn.click();
    expect(await getThemePreference(page)).toBe("light");

    await themeBtn.click();
    expect(await getThemePreference(page)).toBe("dark");
  });
});

// ---------------------------------------------------------------------------
// Anti-flash mechanism
// ---------------------------------------------------------------------------

test.describe("Anti-flash", () => {
  test("dark background is set before CSS modules load", async ({ page }) => {
    // Persist dark theme so the bootstrap IIFE reads it on reload. next-themes
    // stores the plain preference string under the `theme` localStorage key.
    await setTheme(page, "dark");

    // Block the main JS entry point — on reload, only the raw HTML
    // (inline <style> + bootstrap IIFE) will execute. No CSS modules,
    // no React, no store. This simulates the pre-CSS-load window where
    // the flash would appear if the inline styles were missing.
    await page.route("**/src/main.tsx", (route) => route.abort());

    await page.reload({ waitUntil: "domcontentloaded" });

    const result = await page.evaluate(() => {
      const bg = getComputedStyle(document.documentElement).backgroundColor;
      const isDark = document.documentElement.classList.contains("dark");
      return { bg, isDark };
    });

    expect(result.isDark).toBe(true);
    // #0c0f14 -> rgb(12, 15, 20), matching the pre-React dark background.
    expect(result.bg).toBe("rgb(12, 15, 20)");
  });

  test("light background is set before CSS modules load", async ({ page }) => {
    await setTheme(page, "light");

    await page.route("**/src/main.tsx", (route) => route.abort());
    await page.reload({ waitUntil: "domcontentloaded" });

    const result = await page.evaluate(() => {
      const bg = getComputedStyle(document.documentElement).backgroundColor;
      const isDark = document.documentElement.classList.contains("dark");
      return { bg, isDark };
    });

    expect(result.isDark).toBe(false);
    // #fbfbfc -> rgb(251, 251, 252), matching the pre-React light background.
    expect(result.bg).toBe("rgb(251, 251, 252)");
  });
});

// ---------------------------------------------------------------------------
// 2. Status text colors
// ---------------------------------------------------------------------------

test.describe("Status text colors", () => {
  test("2.1 2xx status renders green", async ({ page }) => {
    // Status text with full "200 OK" is rows-mode only; ensure rows (the default).
    await page.getByLabel("Rows view").click();
    await injectExchanges(page, [
      ...makeCompleteExchange(1, "GET", "/api/ok", "200 OK"),
    ]);

    const status = page.getByText("200 OK").first();
    await expect(status).toBeVisible();
    await expect(status).toHaveClass(/text-ok/);
  });

  test("2.2 5xx status renders red", async ({ page }) => {
    // Status text with full "500 Internal Server Error" is rows-mode only.
    await page.getByLabel("Rows view").click();
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
    await expect(status).toHaveClass(/text-server/);
  });
});

test.describe("Status text colors (table mode)", () => {
  test.beforeEach(async ({ page }) => {
    // Default list mode is now "rows"; switch to table for these checks.
    await page.getByLabel("Table view").click();
  });

  test("2.3 2xx status code renders green in table mode", async ({ page }) => {
    await injectExchanges(page, [
      ...makeCompleteExchange(1, "GET", "/api/ok", "200 OK"),
    ]);

    // Table view shows just the numeric code; find it within a row's status cell.
    const status = page
      .locator("button[role='option'] span", { hasText: /^200$/ })
      .first();
    await expect(status).toBeVisible();
    await expect(status).toHaveClass(/text-ok/);
  });

  test("2.4 5xx status code renders red in table mode", async ({ page }) => {
    await injectExchanges(page, [
      ...makeCompleteExchange(
        1,
        "GET",
        "/api/fail",
        "500 Internal Server Error",
      ),
    ]);

    const status = page
      .locator("button[role='option'] span", { hasText: /^500$/ })
      .first();
    await expect(status).toBeVisible();
    await expect(status).toHaveClass(/text-server/);
  });
});

// ---------------------------------------------------------------------------
// 3. Method badge colors
// ---------------------------------------------------------------------------

test.describe("Method badge colors", () => {
  test("3.1 GET and POST badges have distinct method-typed classes", async ({
    page,
  }) => {
    // Method badges are rows-mode only; ensure rows (the default).
    await page.getByLabel("Rows view").click();
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

    // Each badge gets a method-specific bg-method-<m>-bg + text-method-<m>
    // class pair (v2.3 --method-* tokens); assert on the classes rather than
    // computed colors so theme tweaks don't break the test.
    await expect(getBadge).toHaveClass(/bg-method-get-bg/);
    await expect(getBadge).toHaveClass(/text-method-get/);
    await expect(postBadge).toHaveClass(/bg-method-post-bg/);
    await expect(postBadge).toHaveClass(/text-method-post/);
  });
});

test.describe("Method badge colors (table mode)", () => {
  test.beforeEach(async ({ page }) => {
    // Default list mode is now "rows"; switch to table for these checks.
    await page.getByLabel("Table view").click();
  });

  test("3.2 GET and POST have distinct method-typed classes in table mode", async ({
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

    // Table view renders the same MethodBadge as rows mode (v2.3 --method-* tokens).
    const getMethod = page
      .locator("button[role='option'] span", { hasText: /^GET$/ })
      .first();
    const postMethod = page
      .locator("button[role='option'] span", { hasText: /^POST$/ })
      .first();

    await expect(getMethod).toBeVisible();
    await expect(postMethod).toBeVisible();

    await expect(getMethod).toHaveClass(/text-method-get/);
    await expect(postMethod).toHaveClass(/text-method-post/);
  });
});

// ---------------------------------------------------------------------------
// 4. Connection indicator
// ---------------------------------------------------------------------------

test.describe("Connection indicator", () => {
  test("4.1 status bar shows connecting state after reset", async ({
    page,
  }) => {
    // resetStore sets connection back to "connecting" (SSE route is parked —
    // never fulfilled — so EventSource stays in CONNECTING and "open" never fires)
    const dot = page.getByRole("status", { name: "connecting…" }).first();
    await expect(dot).toBeVisible();
    await expect(dot).toHaveClass(/bg-conn-connecting/);
    await expect(page.getByText("connecting…", { exact: true })).toBeVisible();
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

    const dot = page.getByRole("status", { name: "connected" }).first();
    await expect(dot).toBeVisible();
    await expect(dot).toHaveClass(/bg-conn-open/);
  });
});
