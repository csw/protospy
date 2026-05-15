import { test, expect } from "@playwright/test";
import { injectExchanges, resetStore, waitForStore } from "./helpers/inject";
import { makeGetRequest, makeGzipJsonResponse } from "./fixtures/exchanges";

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

// Pre-computed gzip of:
//   {"items":[{"id":1,"name":"alpha"},{"id":2,"name":"beta"}]}
// (generated with `node -e "console.log(require('zlib').gzipSync(Buffer.from(...)).toString('base64'))"`).
// Inlined so the fixture is deterministic across machines/runs.
const GZIP_BASE64 =
  "H4sIAAAAAAAAE6tWyixJzS1WsoquVspMUbIy1FHKS8xNVbJSSswpyEhUqtWBiBvBxZNSSxKVamNrAXGp+bs6AAAA";
const GZIP_BYTES = 66;

test.describe("Inspector — gzip-compressed JSON body", () => {
  test("Bodies tab eventually shows the decoded JSON content", async ({
    page,
  }) => {
    await injectExchanges(page, [
      makeGetRequest(1, "/api/gzipped"),
      makeGzipJsonResponse(1, GZIP_BASE64, GZIP_BYTES),
    ]);

    await page.getByText("/api/gzipped").first().click();

    // After decompression + JSON pretty-print, the JsonViewer renders.
    // Look for distinctive tokens from the payload.
    await expect(page.getByLabel("JSON viewer")).toBeVisible();
    await expect(page.getByText('"items"').first()).toBeVisible();
    await expect(page.getByText('"alpha"').first()).toBeVisible();
    await expect(page.getByText('"beta"').first()).toBeVisible();
  });
});
