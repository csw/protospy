import { test, expect } from "@playwright/test";
import { resetStore, waitForStore } from "./helpers/inject";

// localStorage persistence is currently wired only for dark mode (see
// theme/applyTheme.ts). listWidth, density, order, listMode, and
// traceGroupOn are not persisted — tracked as KI-011 in test-plan.md.

test.beforeEach(async ({ page }) => {
  await page.route("**/info", (route) =>
    route.fulfill({ json: { services: [{ name: "test-backend" }] } }),
  );
  await page.route("**/service/test-backend", (route) =>
    route.fulfill({ contentType: "text/event-stream", body: "" }),
  );
});

async function readTheme(page: import("@playwright/test").Page) {
  return page.evaluate(() =>
    document.documentElement.getAttribute("data-theme"),
  );
}

async function readStoredTheme(page: import("@playwright/test").Page) {
  return page.evaluate(() => localStorage.getItem("theme"));
}

test.describe("localStorage persistence", () => {
  test("dark mode survives a reload", async ({ page }) => {
    await page.goto("/");
    await waitForStore(page);
    await resetStore(page);
    expect(await readTheme(page)).toBe("light");

    // Toggle to dark via the command palette
    await page.keyboard.press("Meta+k");
    await page.getByRole("option", { name: /toggle dark mode/i }).click();
    expect(await readTheme(page)).toBe("dark");
    expect(await readStoredTheme(page)).toBe("dark");

    // Reload — the bootstrap in main.tsx should resolve dark from localStorage
    // before the first paint.
    await page.reload();
    await waitForStore(page);
    expect(await readTheme(page)).toBe("dark");
    expect(await readStoredTheme(page)).toBe("dark");
  });

  test("toggling back to light persists across a reload", async ({ page }) => {
    // First navigation: seed localStorage with "dark" and reload so the
    // bootstrap reads it and paints dark.
    await page.goto("/");
    await waitForStore(page);
    await page.evaluate(() => localStorage.setItem("theme", "dark"));
    await page.reload();
    await waitForStore(page);
    expect(await readTheme(page)).toBe("dark");

    // Toggle back to light.
    await page.keyboard.press("Meta+k");
    await page.getByRole("option", { name: /toggle dark mode/i }).click();
    expect(await readTheme(page)).toBe("light");
    expect(await readStoredTheme(page)).toBe("light");

    // Reload — the persisted value should now be "light".
    await page.reload();
    await waitForStore(page);
    expect(await readTheme(page)).toBe("light");
    expect(await readStoredTheme(page)).toBe("light");
  });
});
