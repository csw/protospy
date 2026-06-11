import { test, expect } from "@playwright/test";
import {
  getResolvedTheme,
  getThemePreference,
  getStoreState,
  setTheme,
  waitForStore,
  waitForTheme,
} from "./helpers/inject";

test.beforeEach(async ({ page }) => {
  await page.route("**/info", (route) =>
    route.fulfill({ json: { services: [{ name: "test-backend" }] } }),
  );
  await page.route("**/service/test-backend/events", (route) =>
    route.fulfill({ contentType: "text/event-stream", body: "" }),
  );
});

test.describe("localStorage persistence", () => {
  test("light theme survives a reload", async ({ page }) => {
    await page.goto("/");
    await waitForStore(page);

    await setTheme(page, "light");
    expect(await getResolvedTheme(page)).toBe("light");

    await page.reload();
    await waitForStore(page);
    await waitForTheme(page);
    expect(await getResolvedTheme(page)).toBe("light");
    expect(await getThemePreference(page)).toBe("light");
  });

  test("switching to dark persists across a reload", async ({ page }) => {
    await page.goto("/");
    await waitForStore(page);

    // Set light first, persist it
    await setTheme(page, "light");
    await page.reload();
    await waitForStore(page);
    expect(await getResolvedTheme(page)).toBe("light");

    // Now switch to dark via command palette
    await page.keyboard.press("Meta+k");
    await page.getByRole("option", { name: /Dark/i }).click();
    await expect(page.locator("html")).toHaveClass(/\bdark\b/);

    await page.reload();
    await waitForStore(page);
    expect(await getResolvedTheme(page)).toBe("dark");
  });

  test("density persists across a reload", async ({ page }) => {
    await page.goto("/");
    await waitForStore(page);

    await page.keyboard.press("Meta+k");
    await page.getByRole("option", { name: /Compact density/i }).click();
    expect(await getStoreState(page, "density")).toBe("compact");

    await page.reload();
    await waitForStore(page);
    expect(await getStoreState(page, "density")).toBe("compact");
  });

  test("order persists across a reload", async ({ page }) => {
    await page.goto("/");
    await waitForStore(page);

    await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__test_store.getState().setOrder("oldest");
    });
    expect(await getStoreState(page, "order")).toBe("oldest");

    await page.reload();
    await waitForStore(page);
    expect(await getStoreState(page, "order")).toBe("oldest");
  });

  test("listMode persists across a reload", async ({ page }) => {
    await page.goto("/");
    await waitForStore(page);

    // Default is "table"; switch to "rows" and verify it persists.
    await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__test_store.getState().setListMode("rows");
    });
    expect(await getStoreState(page, "listMode")).toBe("rows");

    await page.reload();
    await waitForStore(page);
    expect(await getStoreState(page, "listMode")).toBe("rows");
  });

  test("listWidth persists across a reload", async ({ page }) => {
    await page.goto("/");
    await waitForStore(page);

    // Set percentage width and verify both store and localStorage are updated.
    const result = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const store = (window as any).__test_store;
      store.getState().setListWidth("rows", 41);
      return {
        storeValue: store.getState().listWidth,
        lsValue: localStorage.getItem("protospy-ui-prefs"),
      };
    });

    expect(result.storeValue.rows).toBe(41);
    const lsParsed = JSON.parse(result.lsValue!);
    expect(lsParsed.state.listWidth.rows).toBe(41);
  });

  test("all preferences survive a reload", async ({ page }) => {
    await page.goto("/");
    await waitForStore(page);

    await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const s = (window as any).__test_store.getState();
      s.setDensity("compact");
      s.setOrder("oldest");
      s.setListMode("table");
      s.setListWidth("rows", 38);
      s.setListWidth("table", 55);
      s.toggleTraceGroup();
    });
    // Theme lives outside the store now (next-themes), so it persists under its
    // own `theme` localStorage key, not `protospy-ui-prefs`.
    await setTheme(page, "light");

    await page.reload();
    await waitForStore(page);
    await waitForTheme(page);

    expect(await getStoreState(page, "density")).toBe("compact");
    expect(await getStoreState(page, "order")).toBe("oldest");
    expect(await getStoreState(page, "listMode")).toBe("table");
    const listWidth = (await getStoreState(page, "listWidth")) as {
      rows: number;
      table: number;
    };
    expect(listWidth.rows).toBe(38);
    // The mounted resizable panel owns the active table width; after reload it
    // reports its scaffold percentage including the 1px separator.
    expect(listWidth.table).toBeCloseTo(46, 0);
    expect(await getStoreState(page, "traceGroupOn")).toBe(true);
    expect(await getThemePreference(page)).toBe("light");
    expect(await getResolvedTheme(page)).toBe("light");
  });
});
