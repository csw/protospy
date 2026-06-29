import { test, expect } from "@playwright/test";
import {
  getStoreState,
  injectExchanges,
  resetStore,
  waitForStore,
} from "./helpers/inject";
import {
  makeGetRequest,
  makeResponse,
  makeBinaryResponse,
} from "./fixtures/exchanges";

// Eviction (PRO-97) is the first behavior that can remove rows from the live
// list — before it, the store was append-only. The unit/store tests prove the
// selected exchange is never evicted; this browser test proves the *rendered*
// app survives the removal: the pinned old exchange stays selected, its
// inspector keeps showing, the evicted row disappears, and no console error
// fires as the virtualized list shrinks from the middle.
//
// Triggering the byte cap directly would need 512 MB of real payload, so we
// declare large wire sizes instead: `makeBinaryResponse`'s size argument sets
// `wireBytes` without allocating the bytes (the actual chunk payload is a few
// bytes). Two 300 MB exchanges plus the small pinned one cross the 512 MB cap.
const BIG = 300 * 1024 * 1024;
const TINY_BASE64 = "AA==";

test.beforeEach(async ({ page }) => {
  await page.route("**/info", (route) =>
    route.fulfill({ json: { services: [{ name: "test-backend" }] } }),
  );
  await page.route("**/service/test-backend/events", (route) =>
    route.fulfill({ contentType: "text/event-stream", body: "" }),
  );
  await page.goto("/");
  await waitForStore(page);
  await resetStore(page);
});

test("pinned oldest exchange survives byte-cap eviction without a UI glitch (PRO-97)", async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => consoleErrors.push(err.message));

  // Two exchanges under the cap: a small pinned one (#1) and a 300 MB one (#2).
  await injectExchanges(page, [
    makeGetRequest(1, "/api/pinned"),
    makeResponse(1, "200 OK", '{"pinned":true}'),
    makeGetRequest(2, "/api/filler-a"),
    makeBinaryResponse(2, TINY_BASE64, BIG),
  ]);

  // Select the oldest exchange, then keep it visible in the inspector.
  await page.getByText("/api/pinned").first().click();
  await expect(
    page.locator("button[aria-selected='true']").first(),
  ).toBeVisible();
  await expect(page.getByText("Select a request to inspect")).not.toBeVisible();

  // A third 300 MB exchange pushes total wire bytes over 512 MB, forcing
  // eviction of the oldest non-selected exchange (#2) — not the pinned #1.
  await injectExchanges(page, [
    makeGetRequest(3, "/api/filler-b"),
    makeBinaryResponse(3, TINY_BASE64, BIG),
  ]);

  // Store: #1 (pinned) and #3 retained; #2 evicted; selection unchanged.
  await expect.poll(() => getStoreState(page, "ids")).toEqual([1, 3]);
  expect(await getStoreState(page, "selectedId")).toBe(1);

  // Rendered list: pinned row still present and still selected, filler-a gone,
  // filler-b present — the list shrank from the middle without losing the pin.
  await expect(page.getByText("/api/pinned").first()).toBeVisible();
  await expect(
    page.locator("button[aria-selected='true']").first(),
  ).toBeVisible();
  await expect(page.getByText("/api/filler-a")).toHaveCount(0);
  await expect(page.getByText("/api/filler-b").first()).toBeVisible();

  // Inspector never emptied, and nothing threw as rows were removed.
  await expect(page.getByText("Select a request to inspect")).not.toBeVisible();
  expect(consoleErrors).toEqual([]);
});
