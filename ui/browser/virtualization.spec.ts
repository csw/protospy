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

/** Parse the virtualizer container's height style to a number. */
async function getContainerHeightPx(page: Page): Promise<number> {
  const raw = await getVirtualContainerHeight(page);
  return parseFloat(raw);
}

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

    // Higher bound than rows mode: shorter rows → more fit in viewport + overscan
    const rowCount = await page.locator("button[role='option']").count();
    expect(rowCount).toBeLessThan(80);
    expect(rowCount).toBeGreaterThan(5);
  });

  test("switching from rows to table mode updates virtualizer measurements", async ({
    page,
  }) => {
    const N = 200;
    await injectExchanges(page, makeLargeDataset(N));

    // Wait for initial render and capture rows-mode height
    await expect
      .poll(() => getContainerHeightPx(page), { timeout: 5000 })
      .toBeGreaterThan(0);
    const rowsHeight = await getContainerHeightPx(page);

    // Table rows are shorter — total height should decrease
    await setListMode(page, "table");
    await expect
      .poll(() => getContainerHeightPx(page), { timeout: 5000 })
      .toBeLessThan(rowsHeight);
    const tableHeight = await getContainerHeightPx(page);

    // Switching back to rows should restore the taller height
    await setListMode(page, "rows");
    await expect
      .poll(() => getContainerHeightPx(page), { timeout: 5000 })
      .toBeGreaterThan(tableHeight);
  });

  test("density toggle updates virtualizer measurements", async ({ page }) => {
    const N = 200;
    await injectExchanges(page, makeLargeDataset(N));

    // rows + regular
    await expect
      .poll(() => getContainerHeightPx(page), { timeout: 5000 })
      .toBeGreaterThan(0);
    const rowsRegular = await getContainerHeightPx(page);

    // rows + compact → shorter
    await setDensity(page, "compact");
    await expect
      .poll(() => getContainerHeightPx(page), { timeout: 5000 })
      .toBeLessThan(rowsRegular);
    const rowsCompact = await getContainerHeightPx(page);

    // table + compact → even shorter (table rows are shorter than rows-mode rows)
    await setListMode(page, "table");
    await expect
      .poll(() => getContainerHeightPx(page), { timeout: 5000 })
      .toBeLessThan(rowsCompact);
    const tableCompact = await getContainerHeightPx(page);

    // table + regular → taller than table compact
    await setDensity(page, "regular");
    await expect
      .poll(() => getContainerHeightPx(page), { timeout: 5000 })
      .toBeGreaterThan(tableCompact);
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

  test("programmatic selection scrolls off-screen row into view (rows mode)", async ({
    page,
  }) => {
    // Inject 120 exchanges in newest-first order. Exchange 1 is the oldest,
    // so in newest-first it's at the bottom of the list (index ~119).
    await injectExchanges(page, makeLargeDataset(120));

    // Wait for the list to render
    await expect(page.locator("button[role='option']").first()).toBeVisible();

    // Programmatically select exchange 1 (off-screen at the bottom)
    await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__test_store.getState().setSelectedId(1);
    });

    // The selected row should be scrolled into view
    const selected = page.locator(
      "button[role='option'][aria-selected='true']",
    );
    await expect(selected).toBeVisible({ timeout: 5000 });
    await expect(selected).toBeInViewport();
  });

  test("programmatic selection scrolls off-screen row into view (table mode)", async ({
    page,
  }) => {
    await setListMode(page, "table");
    await injectExchanges(page, makeLargeDataset(120));

    await expect(page.locator("button[role='option']").first()).toBeVisible();

    // Select exchange 1 (off-screen at the bottom in newest-first order)
    await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__test_store.getState().setSelectedId(1);
    });

    const selected = page.locator(
      "button[role='option'][aria-selected='true']",
    );
    await expect(selected).toBeVisible({ timeout: 5000 });
    await expect(selected).toBeInViewport();
  });

  test("programmatic selection change from inspector scrolls into view", async ({
    page,
  }) => {
    // Simulate the scenario where a user navigates in the inspector and
    // the selection changes to an exchange far away in the list.
    await injectExchanges(page, makeLargeDataset(120));

    await expect(page.locator("button[role='option']").first()).toBeVisible();

    // First select a visible row (exchange 120 is near the top in newest-first)
    await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__test_store.getState().setSelectedId(120);
    });
    await expect(
      page.locator("button[role='option'][aria-selected='true']"),
    ).toBeVisible();

    // Now jump to exchange 1 (far off-screen at the bottom)
    await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__test_store.getState().setSelectedId(1);
    });

    const selected = page.locator(
      "button[role='option'][aria-selected='true']",
    );
    await expect(selected).toBeVisible({ timeout: 5000 });
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

    // Wait for rows to render before scanning border colors
    await expect(page.locator("button[role='option']").first()).toBeVisible();

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
