import { test, expect } from "@playwright/test";
import { injectExchanges, resetStore, waitForStore } from "./helpers/inject";
import {
  makeCompleteExchange,
  makeRequestWithTrace,
} from "./fixtures/exchanges";
import type { Page } from "@playwright/test";

function makeLargeDataset(count: number) {
  const messages = [];
  for (let i = 1; i <= count; i++) {
    messages.push(
      ...makeCompleteExchange(i, "GET", `/api/item/${i}`, "200 OK", {
        ts: `2024-01-01T00:${String(Math.floor(i / 60)).padStart(2, "0")}:${String(i % 60).padStart(2, "0")}Z`,
      }),
    );
  }
  return messages;
}

async function getVirtualContainerHeight(page: Page): Promise<string> {
  return page.evaluate(() => {
    const listbox = document.querySelector('[role="listbox"]');
    const container = listbox?.firstElementChild as HTMLElement | null;
    return container?.style.height ?? "";
  });
}

async function setListMode(page: Page, mode: "rows" | "table") {
  await page.evaluate((m) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__test_store.getState().setListMode(m);
  }, mode);
}

async function setDensity(page: Page, d: "regular" | "compact") {
  await page.evaluate((v) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__test_store.getState().setDensity(v);
  }, d);
}

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

test.describe("Virtualization", () => {
  test("DOM node count stays bounded with 200 exchanges in rows mode", async ({
    page,
  }) => {
    await injectExchanges(page, makeLargeDataset(200));

    await expect
      .poll(() => page.locator("button[role='option']").count(), {
        timeout: 5000,
      })
      .toBeGreaterThan(0);

    const rowCount = await page.locator("button[role='option']").count();
    expect(rowCount).toBeLessThan(50);
    expect(rowCount).toBeGreaterThan(5);
  });

  test("DOM node count stays bounded with 200 exchanges in table mode", async ({
    page,
  }) => {
    await setListMode(page, "table");
    await injectExchanges(page, makeLargeDataset(200));

    await expect
      .poll(() => page.locator("button[role='option']").count(), {
        timeout: 5000,
      })
      .toBeGreaterThan(0);

    const rowCount = await page.locator("button[role='option']").count();
    expect(rowCount).toBeLessThan(80);
    expect(rowCount).toBeGreaterThan(5);
  });

  test("switching from rows to table mode updates virtualizer measurements", async ({
    page,
  }) => {
    await injectExchanges(page, makeLargeDataset(200));

    // Rows mode: 200 * 74px = 14800px
    await expect
      .poll(() => getVirtualContainerHeight(page), { timeout: 5000 })
      .toBe("14800px");

    // Switch to table mode: 200 * 30px = 6000px
    await setListMode(page, "table");
    await expect
      .poll(() => getVirtualContainerHeight(page), { timeout: 5000 })
      .toBe("6000px");

    // Switch back to rows: 14800px
    await setListMode(page, "rows");
    await expect
      .poll(() => getVirtualContainerHeight(page), { timeout: 5000 })
      .toBe("14800px");
  });

  test("density toggle updates virtualizer measurements", async ({ page }) => {
    await injectExchanges(page, makeLargeDataset(200));

    // Rows regular: 200 * 74px = 14800px
    await expect
      .poll(() => getVirtualContainerHeight(page), { timeout: 5000 })
      .toBe("14800px");

    // Rows compact: 200 * 58px = 11600px
    await setDensity(page, "compact");
    await expect
      .poll(() => getVirtualContainerHeight(page), { timeout: 5000 })
      .toBe("11600px");

    // Table compact: 200 * 24px = 4800px
    await setListMode(page, "table");
    await expect
      .poll(() => getVirtualContainerHeight(page), { timeout: 5000 })
      .toBe("4800px");

    // Table regular: 200 * 30px = 6000px
    await setDensity(page, "regular");
    await expect
      .poll(() => getVirtualContainerHeight(page), { timeout: 5000 })
      .toBe("6000px");
  });

  test("keyboard navigation scrolls off-screen item into view", async ({
    page,
  }) => {
    await injectExchanges(page, makeLargeDataset(100));

    // Click the first visible row to establish selection
    await page.locator("button[role='option']").first().click();

    // Press j enough times to move well past the visible viewport
    for (let i = 0; i < 30; i++) {
      await page.keyboard.press("j");
    }

    // The selected row should be visible (scrolled into view)
    const selected = page.locator(
      "button[role='option'][aria-selected='true']",
    );
    await expect(selected).toBeVisible();
    await expect(selected).toBeInViewport();
  });

  test("trace rail renders on virtualized rows with traces", async ({
    page,
  }) => {
    const traceId = "abcdef1234567890abcdef1234567890";
    const messages = [];
    for (let i = 1; i <= 100; i++) {
      if (i % 3 === 0) {
        messages.push(makeRequestWithTrace(i, traceId, `/api/traced/${i}`));
      } else {
        messages.push(
          ...makeCompleteExchange(i, "GET", `/api/item/${i}`, "200 OK", {
            ts: `2024-01-01T00:${String(Math.floor(i / 60)).padStart(2, "0")}:${String(i % 60).padStart(2, "0")}Z`,
          }),
        );
      }
    }
    await injectExchanges(page, messages);

    // Traced rows should have non-transparent left border color
    const tracedRow = page.locator("button[role='option']").first();
    await expect(tracedRow).toBeVisible();

    const hasTracedBorder = await page.evaluate(() => {
      const rows = document.querySelectorAll("button[role='option']");
      for (const row of rows) {
        const color = getComputedStyle(row).borderLeftColor;
        if (color !== "rgba(0, 0, 0, 0)" && color !== "transparent") {
          return true;
        }
      }
      return false;
    });
    expect(hasTracedBorder).toBe(true);
  });
});
