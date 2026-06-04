import { test, expect } from "@playwright/test";
import { injectExchanges, resetStore, waitForStore } from "./helpers/inject";
import { makeGetRequest, makeResponse } from "./fixtures/exchanges";

// Fixed epoch so all clock arithmetic is deterministic
const FIXED_TIME = new Date("2024-06-01T12:00:00.000Z").getTime();

test.beforeEach(async ({ page }) => {
  // Install fake clock before navigation so React's setInterval is controlled
  await page.clock.install({ time: FIXED_TIME });
  // Freeze the clock so Date.now() doesn't drift under concurrent load.
  // Without pauseAt, install() lets real time continue advancing, causing
  // fastForward() to see extra elapsed time when tests run concurrently.
  await page.clock.pauseAt(new Date(FIXED_TIME));

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

test.describe("Relative timestamps (rows mode)", () => {
  test.beforeEach(async ({ page }) => {
    // Default is now table mode; switch to rows for relative timestamp tests.
    await page.getByLabel("Rows mode").click();
  });

  test("shows 'now' for a freshly injected exchange", async ({ page }) => {
    const ts = new Date(FIXED_TIME).toISOString();
    await injectExchanges(page, [
      makeGetRequest(1, "/api/test", ts),
      makeResponse(1, "200 OK"),
    ]);

    await expect(page.locator("button[aria-selected]").first()).toBeVisible();
    const row = page.locator("button[aria-selected]").first();
    // The timestamp cell shows "now" for a brand-new exchange
    await expect(row.locator(".font-family-mono.text-dim").last()).toHaveText(
      "now",
    );
  });

  test("updates to '5s' after 5 seconds", async ({ page }) => {
    const ts = new Date(FIXED_TIME).toISOString();
    await injectExchanges(page, [
      makeGetRequest(1, "/api/test", ts),
      makeResponse(1, "200 OK"),
    ]);

    await page.locator("button[aria-selected]").first().waitFor();

    // Advance clock by 5 seconds — the ticking hook should re-render
    await page.clock.fastForward(5000);

    const row = page.locator("button[aria-selected]").first();
    await expect(row.locator(".font-family-mono.text-dim").last()).toHaveText(
      "5s",
    );
  });

  test("updates to '1m' after 60 seconds", async ({ page }) => {
    const ts = new Date(FIXED_TIME).toISOString();
    await injectExchanges(page, [
      makeGetRequest(1, "/api/test", ts),
      makeResponse(1, "200 OK"),
    ]);

    await page.locator("button[aria-selected]").first().waitFor();

    await page.clock.fastForward(60_000);

    const row = page.locator("button[aria-selected]").first();
    await expect(row.locator(".font-family-mono.text-dim").last()).toHaveText(
      "1m",
    );
  });
});

test.describe("Absolute timestamps (table mode)", () => {
  // Table mode is the default — no mode switch needed.

  test("shows absolute HH:MM:SS.mmm timestamp", async ({ page }) => {
    const ts = new Date(FIXED_TIME).toISOString();
    await injectExchanges(page, [
      makeGetRequest(1, "/api/test", ts),
      makeResponse(1, "200 OK"),
    ]);

    await page.locator("button[role='option']").first().waitFor();
    const row = page.locator("button[role='option']").first();
    // Absolute time format: HH:MM:SS.mmm (local by default)
    const lastSpan = row.locator("span").last();
    await expect(lastSpan).toHaveText(/^\d{2}:\d{2}:\d{2}\.\d{3}$/);
  });

  test("UTC toggle switches timestamp display", async ({ page }) => {
    // Inject at a known UTC time
    const ts = "2024-06-01T14:30:45.123Z";
    await injectExchanges(page, [
      makeGetRequest(1, "/api/test", ts),
      makeResponse(1, "200 OK"),
    ]);

    await page.locator("button[role='option']").first().waitFor();
    const row = page.locator("button[role='option']").first();
    const lastSpan = row.locator("span").last();

    // Initially shows local time (HH:MM:SS.mmm format)
    await expect(lastSpan).toHaveText(/^\d{2}:\d{2}:\d{2}\.\d{3}$/);

    // Click the UTC toggle in the toolbar
    await page.getByLabel(/Time zone/).click();

    // Should now show UTC time: 14:30:45.123
    await expect(lastSpan).toHaveText("14:30:45.123");
  });

  test("TIME column does not clip the timestamp", async ({ page }) => {
    const ts = "2024-06-01T14:30:45.678Z";
    await injectExchanges(page, [
      makeGetRequest(1, "/api/test", ts),
      makeResponse(1, "200 OK"),
    ]);

    await page.locator("button[role='option']").first().waitFor();

    // The last <span> in the row is the TIME (timestamp) cell. It must not just
    // barely fit — require real slack between the rendered text and the cell's
    // content box. The original bug shipped because the track left ~0px slack,
    // which passed a bare `scrollWidth <= clientWidth` check yet clipped under
    // different font hinting. `scrollWidth` can't see spare room (it is always
    // >= clientWidth), so measure the actual text width via a Range instead.
    const slack = await page
      .locator("button[role='option']")
      .first()
      .locator("span")
      .last()
      .evaluate((el) => {
        const range = document.createRange();
        range.selectNodeContents(el);
        const textWidth = range.getBoundingClientRect().width;
        const cs = getComputedStyle(el);
        const contentWidth =
          el.clientWidth -
          parseFloat(cs.paddingLeft) -
          parseFloat(cs.paddingRight);
        return contentWidth - textWidth;
      });

    expect(slack).toBeGreaterThanOrEqual(3);
  });

  test("UTC toggle persists across reloads", async ({ page }) => {
    // Switch to UTC
    await page.getByLabel(/Time zone/).click();

    // Verify UTC label is active
    await expect(page.getByText("UTC")).toBeVisible();

    // Reload the page
    await page.goto("/");
    await waitForStore(page);

    // UTC should still be active after reload
    await expect(page.getByText("UTC")).toBeVisible();
  });
});
