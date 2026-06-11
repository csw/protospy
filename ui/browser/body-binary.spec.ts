import { test, expect } from "@playwright/test";
import { injectExchanges, resetStore, waitForStore } from "./helpers/inject";
import {
  makeGetRequest,
  makeResponse,
  makeBinaryResponse,
} from "./fixtures/exchanges";

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

// 64 bytes of pseudo-binary content (0x00..0x3F). Base64-encoded inline
// rather than computed at runtime so the fixture is self-evidently fixed.
const BINARY_BYTES = 64;
const BINARY_BASE64 =
  "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8gISIjJCUmJygpKissLS4vMDEyMzQ1Njc4OTo7PD0+Pw==";

test.describe("Inspector — binary body rendering", () => {
  test("Bodies tab shows binary placeholder, no JsonViewer / pre", async ({
    page,
  }) => {
    await injectExchanges(page, [
      makeGetRequest(1, "/api/blob"),
      makeBinaryResponse(1, BINARY_BASE64, BINARY_BYTES),
    ]);

    await page.getByText("/api/blob").first().click();

    // BodyPane renders an EmptyState with the binary message and formatted size.
    // formatSize(64) → "64B".
    await expect(
      page.getByText(`Binary data · ${BINARY_BYTES}B`),
    ).toBeVisible();

    // The short media-type label appears in the response pane head, confirming
    // the response pane is the one rendering binary.
    await expect(page.getByText("octet-stream").first()).toBeVisible();

    // Neither the JsonViewer (aria-label="JSON viewer") nor the text <pre>
    // fallback should render for binary content.
    await expect(page.getByLabel("JSON viewer")).toHaveCount(0);
    await expect(page.locator("pre")).toHaveCount(0);
  });
});

test.describe("BodyPane — media-type slug", () => {
  test("shows a short JSON slug and preserves the full Content-Type in the tooltip", async ({
    page,
  }) => {
    await injectExchanges(page, [
      makeGetRequest(1, "/api/json"),
      makeResponse(1, "200 OK", '{"ok":true}', undefined, [
        { name: "Content-Type", value: "application/json; charset=utf-8" },
      ]),
    ]);

    await page.getByText("/api/json").first().click();

    const mediaType = page.getByTestId("body-media-type");
    await expect(mediaType).toHaveText("json");
    await expect(page.getByText("application/json; charset=utf-8")).toHaveCount(
      0,
    );

    await mediaType.hover();

    await expect(
      page.getByText("application/json; charset=utf-8"),
    ).toBeVisible();
  });
});
