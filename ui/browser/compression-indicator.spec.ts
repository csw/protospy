/**
 * Browser tests for the compression indicator shown alongside `wireBytes`
 * in the exchange list (both rows and table modes) and in the timing view.
 *
 * The indicator is a small icon next to the size value with a tooltip and
 * accessible label naming the encoding. It appears for any exchange whose
 * request or response body has `Content-Encoding` set, and is absent for
 * uncompressed exchanges.
 */

import { test, expect } from "@playwright/test";
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
  await page.route("**/service/test-backend", (route) =>
    route.fulfill({ contentType: "text/event-stream", body: "" }),
  );
  await page.goto("/");
  await waitForStore(page);
  await resetStore(page);
});

test.describe("Compression indicator", () => {
  test("is visible in rows mode for a gzip-compressed response", async ({
    page,
  }) => {
    await injectExchanges(page, [
      makeGetRequest(1, "/api/compressed"),
      makeEncodedJsonResponse(1, GZIP_BASE64, GZIP_BYTES, "gzip"),
      makeGetRequest(2, "/api/plain"),
      makeResponse(2, "200 OK", '{"ok":true}'),
    ]);

    const indicators = page.getByTestId("compression-indicator");
    // One in the list row for exchange 1; none for exchange 2.
    await expect(indicators).toHaveCount(1);
    await expect(indicators.first()).toHaveAttribute(
      "title",
      "Compressed: gzip",
    );
  });

  test("is visible in table mode for a compressed response", async ({
    page,
  }) => {
    // Switch to table mode
    await page.getByLabel("Table mode").click();

    await injectExchanges(page, [
      makeGetRequest(1, "/api/compressed"),
      makeEncodedJsonResponse(1, GZIP_BASE64, GZIP_BYTES, "gzip"),
    ]);

    const indicator = page.getByTestId("compression-indicator").first();
    await expect(indicator).toBeVisible();
    await expect(indicator).toHaveAttribute("title", "Compressed: gzip");
  });

  test("appears in timing view for a compressed response", async ({ page }) => {
    await injectExchanges(page, [
      makeGetRequest(1, "/api/compressed"),
      makeEncodedJsonResponse(1, GZIP_BASE64, GZIP_BYTES, "gzip"),
    ]);

    await page.getByText("/api/compressed").first().click();
    await page.getByRole("tab", { name: "Timing" }).click();

    // The timing view adds one more indicator (next to "Response size").
    const indicators = page.getByTestId("compression-indicator");
    // 1 in list row + 1 in timing fact row = 2 visible at minimum.
    await expect(indicators).toHaveCount(2);
    await expect(page.getByText("(gzip)")).toBeVisible();
  });

  test("is absent when no body is compressed", async ({ page }) => {
    await injectExchanges(page, [
      makeGetRequest(1, "/api/plain"),
      makeResponse(1, "200 OK", '{"ok":true}'),
    ]);

    await page.getByText("/api/plain").first().click();
    await page.getByRole("tab", { name: "Timing" }).click();

    await expect(page.getByTestId("compression-indicator")).toHaveCount(0);
  });
});
