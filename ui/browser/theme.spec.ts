import { test, expect } from "@playwright/test";
import {
  getStoreState,
  injectExchanges,
  resetStore,
  waitForStore,
} from "./helpers/inject";
import { makeCompleteExchange } from "./fixtures/exchanges";

test.beforeEach(async ({ page }) => {
  await page.route("**/info", (route) =>
    route.fulfill({ json: { services: [{ name: "test-backend" }] } }),
  );
  await page.route("**/service/test-backend", async () => {
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
  test("1.1 default theme resolves to a valid data-theme", async ({ page }) => {
    // DEFAULT_THEME is 'system' in tests (no ?defaultTheme= param), which
    // resolves to 'dark' or 'light' depending on the OS. Just verify a
    // valid value is set.
    const theme = await page.evaluate(() =>
      document.documentElement.getAttribute("data-theme"),
    );
    expect(["dark", "light"]).toContain(theme);
  });

  test("1.2 set light mode via command palette", async ({ page }) => {
    await page.keyboard.press("Meta+k");
    await page.getByText("Light mode").click();

    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    expect(await getStoreState(page, "theme")).toBe("light");
  });

  test("1.3 set dark mode via command palette", async ({ page }) => {
    // Start from light to verify the switch
    await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__test_store.getState().setTheme("light");
    });
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

    await page.keyboard.press("Meta+k");
    await page.getByText("Dark mode").click();

    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    expect(await getStoreState(page, "theme")).toBe("dark");
  });

  test("1.4 set system mode via command palette", async ({ page }) => {
    await page.keyboard.press("Meta+k");
    await page.getByText("System theme").click();

    expect(await getStoreState(page, "theme")).toBe("system");
    // data-theme should resolve to the OS preference (dark or light)
    const theme = await page.evaluate(() =>
      document.documentElement.getAttribute("data-theme"),
    );
    expect(["dark", "light"]).toContain(theme);
  });

  test("1.5 theme cycle via TopBar button: dark → light → system", async ({
    page,
  }) => {
    // Start at dark
    await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__test_store.getState().setTheme("dark");
    });

    // Click the theme button (has aria-label containing "Theme:")
    const themeBtn = page.locator('button[aria-label^="Theme:"]');
    await themeBtn.click();
    expect(await getStoreState(page, "theme")).toBe("light");

    await themeBtn.click();
    expect(await getStoreState(page, "theme")).toBe("system");

    await themeBtn.click();
    expect(await getStoreState(page, "theme")).toBe("dark");
  });
});

// ---------------------------------------------------------------------------
// Anti-flash mechanism
// ---------------------------------------------------------------------------

test.describe("Anti-flash", () => {
  test("dark background is set before CSS modules load", async ({ page }) => {
    // Persist dark theme so the bootstrap IIFE reads it on reload.
    await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__test_store.getState().setTheme("dark");
    });

    // Block the main JS entry point — on reload, only the raw HTML
    // (inline <style> + bootstrap IIFE) will execute. No CSS modules,
    // no React, no store. This simulates the pre-CSS-load window where
    // the flash would appear if the inline styles were missing.
    await page.route("**/src/main.tsx", (route) => route.abort());

    await page.reload({ waitUntil: "domcontentloaded" });

    const result = await page.evaluate(() => {
      const bg = getComputedStyle(document.documentElement).backgroundColor;
      const theme = document.documentElement.getAttribute("data-theme");
      return { bg, theme };
    });

    expect(result.theme).toBe("dark");
    // #0c0f14 → rgb(12, 15, 20) — must match --color-bg in tailwind.css
    expect(result.bg).toBe("rgb(12, 15, 20)");
  });

  test("light background is set before CSS modules load", async ({ page }) => {
    await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__test_store.getState().setTheme("light");
    });

    await page.route("**/src/main.tsx", (route) => route.abort());
    await page.reload({ waitUntil: "domcontentloaded" });

    const result = await page.evaluate(() => {
      const bg = getComputedStyle(document.documentElement).backgroundColor;
      const theme = document.documentElement.getAttribute("data-theme");
      return { bg, theme };
    });

    expect(result.theme).toBe("light");
    // #fbfbfc → rgb(251, 251, 252) — must match --color-bg in tailwind.css
    expect(result.bg).toBe("rgb(251, 251, 252)");
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
    await expect(status).toHaveClass(/text-green/);
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
    await expect(status).toHaveClass(/text-red/);
  });
});

// ---------------------------------------------------------------------------
// 3. Method badge colors
// ---------------------------------------------------------------------------

test.describe("Method badge colors", () => {
  test("3.1 GET and POST badges have distinct method-typed classes", async ({
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

    // Each badge gets a method-specific bg-m-<method>-bg + text-m-<method>
    // class pair from methodBadgeClass(); assert on the classes rather than
    // computed colors so theme tweaks don't break the test.
    await expect(getBadge).toHaveClass(/bg-m-get-bg/);
    await expect(getBadge).toHaveClass(/text-m-get/);
    await expect(postBadge).toHaveClass(/bg-m-post-bg/);
    await expect(postBadge).toHaveClass(/text-m-post/);
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
