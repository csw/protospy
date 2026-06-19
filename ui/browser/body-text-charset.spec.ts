import { test, expect } from "@playwright/test";
import { injectExchanges, resetStore, waitForStore } from "./helpers/inject";
import {
  makeGetRequest,
  makeResponse,
  makeCharsetTextResponse,
} from "./fixtures/exchanges";

// "Name,Value\ncafé,42\n" encoded as ISO-8859-1 (é = 0xE9 → one byte in latin1)
const iso8859Buf = Buffer.from("Name,Value\ncafé,42\n", "latin1");
const ISO8859_CSV_BASE64 = iso8859Buf.toString("base64");
const ISO8859_CSV_BYTES = iso8859Buf.length;

// “café ☃\n” in UTF-16LE, prefixed with the BOM character (\uFEFF encodes as FF FE)
const utf16leBuf = Buffer.from("\uFEFF" + "café ☃\n", "utf16le");
const UTF16LE_BASE64 = utf16leBuf.toString("base64");
const UTF16LE_BYTES = utf16leBuf.length;

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

test.describe("Charset-aware body decoding (PRO-415)", () => {
  test("ISO-8859-1 text/csv body renders accented characters correctly", async ({
    page,
  }) => {
    await injectExchanges(page, [
      makeGetRequest(1, "/api/export.csv"),
      makeCharsetTextResponse(1, ISO8859_CSV_BASE64, ISO8859_CSV_BYTES),
    ]);

    await page.getByText("/api/export.csv").first().click();

    // The body pane should show text mode (not the binary summary).
    await expect(page.getByTestId("body-summary")).toHaveCount(0);

    // The accented character 'é' must appear in the rendered text.
    // This verifies the browser's TextDecoder uses the declared charset,
    // not the default UTF-8 (which would produce a replacement character).
    const bodyText = page.getByLabel("Body text");
    await expect(bodyText).toContainText("café");
    await expect(bodyText).toContainText("Name,Value");
  });

  test("UTF-16LE text/plain body renders non-ASCII characters correctly", async ({
    page,
  }) => {
    await injectExchanges(page, [
      makeGetRequest(1, "/api/greeting"),
      makeCharsetTextResponse(
        1,
        UTF16LE_BASE64,
        UTF16LE_BYTES,
        "text/plain; charset=utf-16le",
      ),
    ]);

    await page.getByText("/api/greeting").first().click();

    // The body pane should show text mode (not the binary summary).
    await expect(page.getByTestId("body-summary")).toHaveCount(0);

    // The accented character 'é' and the snowman '☃' must appear.
    const bodyText = page.getByLabel("Body text");
    await expect(bodyText).toContainText("café");
    await expect(bodyText).toContainText("☃");
  });

  test("application/javascript body renders as text (not binary summary)", async ({
    page,
  }) => {
    const jsBody = "console.log('hello world');";
    await injectExchanges(page, [
      makeGetRequest(1, "/app.js"),
      makeResponse(1, "200 OK", jsBody, undefined, [
        { name: "Content-Type", value: "application/javascript" },
      ]),
    ]);

    await page.getByText("/app.js").first().click();

    // application/javascript should be classified as text, not binary.
    await expect(page.getByTestId("body-summary")).toHaveCount(0);
    const bodyText = page.getByLabel("Body text");
    await expect(bodyText).toContainText("console.log");
  });
});
