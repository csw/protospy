import { test, expect } from "@playwright/test";
import { injectExchanges, resetStore, waitForStore } from "./helpers/inject";
import { makeGetRequest, makeResponse } from "./fixtures/exchanges";

// Fixed epoch so all clock arithmetic is deterministic
const FIXED_TIME = new Date("2024-06-01T12:00:00.000Z").getTime();

test.beforeEach(async ({ page }) => {
  // Install fake clock before navigation so React's setInterval is controlled
  await page.clock.install({ time: FIXED_TIME });

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

test.describe("Relative timestamps", () => {
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

  test("table mode shows relative timestamp that ticks", async ({ page }) => {
    const ts = new Date(FIXED_TIME).toISOString();
    await injectExchanges(page, [
      makeGetRequest(1, "/api/test", ts),
      makeResponse(1, "200 OK"),
    ]);

    // Switch to table mode
    await page.getByRole("button", { name: "Table mode" }).click();

    await page.locator("button[aria-selected]").first().waitFor();

    // Should initially show "now"
    const row = page.locator("button[aria-selected]").first();
    await expect(row.locator("span").last()).toHaveText("now");

    // Advance 5 seconds
    await page.clock.fastForward(5000);
    await expect(row.locator("span").last()).toHaveText("5s");
  });
});
