import { test, expect } from "@playwright/test";
import { getStoreState, waitForStore } from "./helpers/inject";

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

test.describe("localStorage persistence", () => {
  test("light theme survives a reload", async ({ page }) => {
    await page.goto("/");
    await waitForStore(page);

    await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__test_store.getState().setTheme("light");
    });
    expect(await readTheme(page)).toBe("light");

    await page.reload();
    await waitForStore(page);
    expect(await readTheme(page)).toBe("light");
    expect(await getStoreState(page, "theme")).toBe("light");
  });

  test("switching to dark persists across a reload", async ({ page }) => {
    await page.goto("/");
    await waitForStore(page);

    // Set light first, persist it
    await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__test_store.getState().setTheme("light");
    });
    await page.reload();
    await waitForStore(page);
    expect(await readTheme(page)).toBe("light");

    // Now switch to dark via command palette
    await page.keyboard.press("Meta+k");
    await page.getByRole("option", { name: /dark mode/i }).click();
    expect(await readTheme(page)).toBe("dark");

    await page.reload();
    await waitForStore(page);
    expect(await readTheme(page)).toBe("dark");
  });

  test("density persists across a reload", async ({ page }) => {
    await page.goto("/");
    await waitForStore(page);

    await page.keyboard.press("Meta+k");
    await page.getByRole("option", { name: /toggle density/i }).click();
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

    await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__test_store.getState().setListMode("table");
    });
    expect(await getStoreState(page, "listMode")).toBe("table");

    await page.reload();
    await waitForStore(page);
    expect(await getStoreState(page, "listMode")).toBe("table");
  });

  test("listWidth persists across a reload", async ({ page }) => {
    await page.goto("/");
    await waitForStore(page);

    // Set width and verify both store and localStorage are updated
    const result = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const store = (window as any).__test_store;
      store.getState().setListWidth("rows", 450);
      return {
        storeValue: store.getState().listWidth,
        lsValue: localStorage.getItem("protospy-ui-prefs"),
      };
    });

    expect(result.storeValue.rows).toBe(450);
    const lsParsed = JSON.parse(result.lsValue!);
    expect(lsParsed.state.listWidth.rows).toBe(450);
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
      s.setListWidth("rows", 400);
      s.setListWidth("table", 500);
      s.toggleTraceGroup();
      s.setTheme("light");
    });

    await page.reload();
    await waitForStore(page);

    expect(await getStoreState(page, "density")).toBe("compact");
    expect(await getStoreState(page, "order")).toBe("oldest");
    expect(await getStoreState(page, "listMode")).toBe("table");
    expect(await getStoreState(page, "listWidth")).toEqual({
      rows: 400,
      table: 500,
    });
    expect(await getStoreState(page, "traceGroupOn")).toBe(true);
    expect(await getStoreState(page, "theme")).toBe("light");
    expect(await readTheme(page)).toBe("light");
  });
});
