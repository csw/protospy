/**
 * Browser tests for the compression display shown alongside `wireBytes`
 * in the exchange list (both rows and table modes) and in the timing view.
 *
 * A compressed body shows a `(encoding)` tag after the wire size, e.g.
 * `res 28B (gzip)`. The size cell also carries a tooltip explaining the
 * wire/decoded distinction. Uncompressed bodies show no tag. When the
 * body has been opened in the inspector once, the decoded byte count is
 * cached back on the store, and surfaces switch to dual `wire/decoded`
 * display (Chrome DevTools convention).
 */

import { test, expect } from "./fixtures/coverage";
import { injectExchanges, resetStore, waitForStore } from "./helpers/inject";
import {
  makeGetRequest,
  makeResponse,
  makeEncodedJsonResponse,
} from "./fixtures/exchanges";

const GZIP_BASE64 =
  "H4sIAAAAAAAAE6tWyixJzS1WsoquVspMUbIy1FHKS8xNVbJSSswpyEhUqtWBiBvBxZNSSxKVamNrAXGp+bs6AAAA";
const GZIP_BYTES = 66;

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

test.describe("Compression display", () => {
  test("is visible in rows mode for a gzip-compressed response", async ({
    page,
  }) => {
    // Rows view renders the encoding inline as "(gzip)" after the size.
    await page.getByLabel("Rows view").click();

    await injectExchanges(page, [
      makeGetRequest(1, "/api/compressed"),
      makeEncodedJsonResponse(1, GZIP_BASE64, GZIP_BYTES, "gzip"),
      makeGetRequest(2, "/api/plain"),
      makeResponse(2, "200 OK", '{"ok":true}'),
    ]);

    // The compressed row should show "(gzip)"; the plain row should not.
    const tags = page.getByText("(gzip)");
    await expect(tags).toHaveCount(1);
  });

  test("shows a compression marker + tooltip in table mode (not inline tag)", async ({
    page,
  }) => {
    // Switch to table mode (rows is the default). Unlike rows mode, the
    // fixed-width SIZE column shows a compression icon with the encoding in the
    // tooltip — no inline "(gzip)" text, which would overflow the narrow track
    // (PRO-286).
    await page.getByLabel("Table view").click();
    await injectExchanges(page, [
      makeGetRequest(1, "/api/compressed"),
      makeEncodedJsonResponse(1, GZIP_BASE64, GZIP_BYTES, "gzip"),
    ]);

    const sizeCell = page
      .locator("button[role='option']")
      .first()
      .locator(":scope > span")
      .nth(4);
    // Compression marker icon is present...
    await expect(sizeCell.locator("svg")).toBeVisible();
    // ...the encoding is in the tooltip...
    await expect(sizeCell).toHaveAttribute("title", /gzip/);
    // ...and there is no inline "(gzip)" text anywhere in the table.
    await expect(page.getByText("(gzip)")).toHaveCount(0);
  });

  test("appears in timing view for a compressed response", async ({ page }) => {
    await injectExchanges(page, [
      makeGetRequest(1, "/api/compressed"),
      makeEncodedJsonResponse(1, GZIP_BASE64, GZIP_BYTES, "gzip"),
    ]);

    await page.getByText("/api/compressed").first().click();
    await page.getByRole("tab", { name: "Timing" }).click();

    // Scope to the Timing tab panel so the list-row "(gzip)" doesn't
    // bleed into this assertion.
    const timingPanel = page.getByRole("tabpanel");
    await expect(timingPanel.getByText("(gzip)")).toBeVisible();
  });

  test("is absent when no body is compressed", async ({ page }) => {
    await injectExchanges(page, [
      makeGetRequest(1, "/api/plain"),
      makeResponse(1, "200 OK", '{"ok":true}'),
    ]);

    await page.getByText("/api/plain").first().click();
    await page.getByRole("tab", { name: "Timing" }).click();

    // No parenthesised encoding label anywhere on the page.
    await expect(page.getByText(/^\([a-z]+\)$/)).toHaveCount(0);
  });
});
