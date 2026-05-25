/**
 * Browser tests for Content-Encoding decompression in the body pane.
 *
 * Each test injects a compressed exchange into the store and asserts that the
 * Inspector renders the decompressed JSON — verifying the full pipeline from
 * the wire bytes through the WASM/DecompressionStream decoder to the UI.
 *
 * Encodings covered:
 *   gzip     → body-gzip.spec.ts (separate file, pre-existing)
 *   deflate  → this file
 *   br       → this file (uses brotli-dec-wasm WASM in real Chromium)
 *   zstd     → add here when PRO-207 (zstd decompression) lands
 */

import { test, expect } from "@playwright/test";
import { injectExchanges, resetStore, waitForStore } from "./helpers/inject";
import { makeGetRequest, makeEncodedJsonResponse } from "./fixtures/exchanges";

// ---------------------------------------------------------------------------
// Shared payload
//
// {"items":[{"id":1,"name":"alpha"},{"id":2,"name":"beta"}]}
//
// All fixtures below compress this same JSON so the assertions are uniform.
// Regenerate with Node:
//   const p = JSON.stringify({items:[{id:1,name:"alpha"},{id:2,name:"beta"}]});
//   zlib.deflateSync(Buffer.from(p)).toString("base64")
//   zlib.brotliCompressSync(Buffer.from(p)).toString("base64")
// ---------------------------------------------------------------------------

const DEFLATE_BASE64 =
  "eJyrVsosSc0tVrKKrlbKTFGyMtRRykvMTVWyUkrMKchIVKrVgYgbwcWTUksSlWpjawEXOhIm";
const DEFLATE_BYTES = 54;

const BROTLI_BASE64 =
  "ixyAeyJpdGVtcyI6W3siaWQiOjEsIm5hbWUiOiJhbHBoYSJ9LHsiaWQiOjIsIm5hbWUiOiJiZXRhIn1dfQM=";
const BROTLI_BYTES = 62;

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// deflate
// ---------------------------------------------------------------------------

test.describe("Inspector — deflate-compressed JSON body", () => {
  test("Bodies tab shows the decoded JSON content", async ({ page }) => {
    await injectExchanges(page, [
      makeGetRequest(1, "/api/deflated"),
      makeEncodedJsonResponse(1, DEFLATE_BASE64, DEFLATE_BYTES, "deflate"),
    ]);

    await page.getByText("/api/deflated").first().click();

    await expect(page.getByLabel("JSON viewer")).toBeVisible();
    await expect(page.getByText('"items"').first()).toBeVisible();
    await expect(page.getByText('"alpha"').first()).toBeVisible();
    await expect(page.getByText('"beta"').first()).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// brotli
//
// This test exercises brotli-dec-wasm (the WASM decompressor) running in a
// real Chromium browser. The WASM binary is loaded via Vite's asset URL for
// new URL(..., import.meta.url) patterns. If the WASM fails to load or
// decompress, the JSON viewer will not appear and the test will fail.
// ---------------------------------------------------------------------------

test.describe("Inspector — brotli-compressed JSON body", () => {
  test("Bodies tab shows the decoded JSON content", async ({ page }) => {
    await injectExchanges(page, [
      makeGetRequest(1, "/api/brotli"),
      makeEncodedJsonResponse(1, BROTLI_BASE64, BROTLI_BYTES, "br"),
    ]);

    await page.getByText("/api/brotli").first().click();

    await expect(page.getByLabel("JSON viewer")).toBeVisible();
    await expect(page.getByText('"items"').first()).toBeVisible();
    await expect(page.getByText('"alpha"').first()).toBeVisible();
    await expect(page.getByText('"beta"').first()).toBeVisible();
  });
});
