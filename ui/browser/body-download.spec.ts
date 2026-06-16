import { test, expect } from "@playwright/test";
import { injectExchanges, resetStore, waitForStore } from "./helpers/inject";
import {
  makeGetRequest,
  makeTextResponse,
  makeBinaryResponse,
} from "./fixtures/exchanges";

// Exercises the real BodyPane download button on the rendered page: a real
// Blob URL, real anchor click, and real Playwright download event. The
// component unit test mocks `downloadBytes` entirely; this is the companion
// test on the production code path (testing.md, "Test the real production
// code path").

const BINARY_BYTES = 12;
const BINARY_BASE64 = "AAECAwQFBgcICQoLDA0ODw==";

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

test.describe("BodyPane — download button", () => {
  test("header download icon button is enabled for a decoded text body", async ({
    page,
  }) => {
    await injectExchanges(page, [
      makeGetRequest(1, "/api/data.txt"),
      makeTextResponse(1),
    ]);

    await page.getByText("/api/data.txt").first().click();

    // The response pane has a decoded text body — the header download button
    // should be enabled.
    const downloadBtn = page.getByRole("button", { name: "Download" }).first();
    await expect(downloadBtn).toBeEnabled();
  });

  test("clicking the header download button triggers a file download with the correct filename", async ({
    page,
  }) => {
    const bodyText = "hello download";
    await injectExchanges(page, [
      makeGetRequest(1, "/export/report.txt"),
      makeTextResponse(1, bodyText),
    ]);

    await page.getByText("/export/report.txt").first().click();

    const downloadBtn = page.getByRole("button", { name: "Download" }).first();
    await expect(downloadBtn).toBeEnabled();

    // `page.waitForEvent("download")` captures the Playwright download event
    // triggered by the synthetic anchor click inside `downloadBytes`. This
    // exercises the real Blob + object-URL + anchor-click path in Chromium.
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      downloadBtn.click(),
    ]);

    // Filename derives from the last URI path segment (report.txt has an extension).
    expect(download.suggestedFilename()).toBe("report.txt");
  });

  test("binary empty state shows a prominent Download button that triggers a download", async ({
    page,
  }) => {
    await injectExchanges(page, [
      makeGetRequest(1, "/api/artifact.bin"),
      makeBinaryResponse(1, BINARY_BASE64, BINARY_BYTES),
    ]);

    await page.getByText("/api/artifact.bin").first().click();

    // The prominent Download button in the binary empty state.
    await expect(
      page.getByText(`Binary data · ${BINARY_BYTES}B`),
    ).toBeVisible();

    // There are two "Download" buttons: the icon button in the header and the
    // labeled button in the binary empty state. The labeled one is the target.
    const downloadBtns = page.getByRole("button", { name: "Download" });
    await expect(downloadBtns).toHaveCount(2);

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      // Click the second Download button (the labeled one in the binary state).
      downloadBtns.nth(1).click(),
    ]);

    expect(download.suggestedFilename()).toBe("artifact.bin");
  });

  test("header download button derives filename from Content-Disposition when present", async ({
    page,
  }) => {
    const bodyText = "content here";
    await injectExchanges(page, [
      makeGetRequest(1, "/api/data"),
      {
        exchange: { exchange_id: 1, timestamp: "2024-01-01T00:00:00Z" },
        direction: "Response",
        event: {
          type: "Response",
          status: "200 OK",
          version: "HTTP/1.1",
          headers: [
            { name: "Content-Type", value: "text/plain" },
            {
              name: "Content-Disposition",
              value: 'attachment; filename="custom-export.txt"',
            },
          ],
          elapsed_ms: 10,
          body: {
            type: "Data",
            content: {
              offset: 0,
              length: bodyText.length,
              payload: { text: bodyText },
            },
            trailers: null,
            at_end: true,
            total_bytes: bodyText.length,
          },
        },
      },
    ]);

    await page.getByText("/api/data").first().click();

    const downloadBtn = page.getByRole("button", { name: "Download" }).first();
    await expect(downloadBtn).toBeEnabled();

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      downloadBtn.click(),
    ]);

    expect(download.suggestedFilename()).toBe("custom-export.txt");
  });
});
