import { test, expect } from "./fixtures/coverage";
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
  await page.route("**/service/test-backend/events", (route) =>
    route.fulfill({
      contentType: "text/event-stream",
      body: "",
    }),
  );
  await page.goto("/");
  await waitForStore(page);
  await resetStore(page);
});

test.describe("Absolute timestamps (rows mode)", () => {
  test.beforeEach(async ({ page }) => {
    // Default is now rows mode, but click to be explicit/robust.
    await page.getByLabel("Rows view").click();
  });

  // PRO-359 (kept deviation §3): rows-mode timestamps are absolute
  // HH:MM:SS.mmm, matching table mode — the prior relative age ("now"/"5s"/"1m")
  // was a known oversight and was removed.
  test("shows an absolute HH:MM:SS.mmm timestamp, not a relative age", async ({
    page,
  }) => {
    const ts = new Date(FIXED_TIME).toISOString();
    await injectExchanges(page, [
      makeGetRequest(1, "/api/test", ts),
      makeResponse(1, "200 OK"),
    ]);

    const row = page.locator("button[aria-selected]").first();
    await expect(row).toBeVisible();
    // No word-boundary anchors: the concatenated row text abuts the status
    // ("...200 OK12:00:00.000..."), so \b before the digits would not match.
    await expect(row).toContainText(/\d{2}:\d{2}:\d{2}\.\d{3}/);

    // It must NOT tick as a relative age when the clock advances.
    const before = await row.textContent();
    await page.clock.fastForward(60_000);
    expect(await row.textContent()).toBe(before);
  });
});

test.describe("Absolute timestamps (table mode)", () => {
  test.beforeEach(async ({ page }) => {
    // Default list mode is now "rows"; switch to table for these checks.
    await page.getByLabel("Table view").click();
  });

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

    await page.getByRole("radio", { name: "UTC" }).click();

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
    await page.getByRole("radio", { name: "UTC" }).click();

    // Verify UTC label is active
    await expect(page.getByRole("radio", { name: "UTC" })).toBeChecked();

    // Reload the page
    await page.goto("/");
    await waitForStore(page);

    // UTC should still be active after reload
    await expect(page.getByRole("radio", { name: "UTC" })).toBeChecked();
  });
});
