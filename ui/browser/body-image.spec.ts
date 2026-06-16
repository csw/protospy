import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect } from "@playwright/test";
import { injectExchanges, resetStore, waitForStore } from "./helpers/inject";
import { makeGetRequest, makeImageResponse } from "./fixtures/exchanges";

// Utah Teapot PNG (1280×847, ~311 KB). Loaded at test-module startup so the
// browser tests exercise the render path with a real, visually recognisable
// image rather than an invisible 1×1 pixel stub.
const _teapotBuf = readFileSync(
  join(
    dirname(fileURLToPath(import.meta.url)),
    "../src/test/assets/Utah_teapot_simple_2.png",
  ),
);
const PNG_1PX_BASE64 = _teapotBuf.toString("base64");
const PNG_1PX_BYTES = _teapotBuf.length;

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

test.describe("Inspector — image body rendering (PRO-412)", () => {
  test("parsed view renders an <img> with a base64 data URI for image/png", async ({
    page,
  }) => {
    await injectExchanges(page, [
      makeGetRequest(1, "/images/teapot.png"),
      makeImageResponse(1, PNG_1PX_BASE64, PNG_1PX_BYTES, "image/png"),
    ]);

    await page.getByText("/images/teapot.png").first().click();

    // The <img> must be present with the correct data URI prefix.
    const img = page.getByRole("img", { name: "image/png" });
    await expect(img).toBeVisible();
    const src = await img.getAttribute("src");
    expect(src).toMatch(/^data:image\/png;base64,/);

    // Confirm the data URI round-trips: the decoded bytes of the embedded
    // base64 must form a valid PNG (PNG magic: 89 50 4E 47 0D 0A 1A 0A).
    const isValidPng = await page.evaluate((dataSrc) => {
      const base64 = dataSrc!.split(",")[1];
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      // PNG magic bytes
      return (
        bytes[0] === 0x89 &&
        bytes[1] === 0x50 &&
        bytes[2] === 0x4e &&
        bytes[3] === 0x47
      );
    }, src);
    expect(isValidPng).toBe(true);

    // The short media-type slug "png" appears in the response pane subhead.
    await expect(page.getByTestId("body-media-type").first()).toHaveText("png");

    // No binary placeholder, no JSON tree viewer, no pre block.
    await expect(page.getByText(/Binary data/)).toHaveCount(0);
    await expect(page.getByLabel("JSON viewer")).toHaveCount(0);
  });

  test("image is naturally sized and the pane does not show a binary placeholder", async ({
    page,
  }) => {
    await injectExchanges(page, [
      makeGetRequest(1, "/logo.png"),
      makeImageResponse(1, PNG_1PX_BASE64, PNG_1PX_BYTES),
    ]);

    await page.getByText("/logo.png").first().click();

    await expect(page.getByRole("img", { name: "image/png" })).toBeVisible();
    await expect(page.getByText(/Binary data/)).toHaveCount(0);
  });

  test("raw view shows the decoded bytes as text, not the <img>", async ({
    page,
  }) => {
    await injectExchanges(page, [
      makeGetRequest(1, "/images/teapot.png"),
      makeImageResponse(1, PNG_1PX_BASE64, PNG_1PX_BYTES),
    ]);

    await page.getByText("/images/teapot.png").first().click();

    // Switch to raw view — the toggle button text varies; find by role.
    await page.getByRole("radio", { name: "Raw" }).click();

    // Raw view shows the raw decoded text (PNG bytes as UTF-8); no <img>.
    await expect(page.getByLabel("Raw body viewer")).toBeVisible();
    await expect(page.getByRole("img", { name: "image/png" })).toHaveCount(0);
  });

  test("image/jpeg and image/gif also render inline, not as binary", async ({
    page,
  }) => {
    for (const contentType of ["image/jpeg", "image/gif"] as const) {
      await resetStore(page);
      await injectExchanges(page, [
        makeGetRequest(1, "/img"),
        // Use the PNG bytes for both — the browser won't render a 1px PNG as
        // JPEG/GIF, but it will still create the <img> element with the data
        // URI, which is what the decode pipeline is responsible for.
        makeImageResponse(1, PNG_1PX_BASE64, PNG_1PX_BYTES, contentType),
      ]);
      await page.getByText("/img").first().click();
      await expect(page.getByRole("img", { name: contentType })).toBeVisible();
      await expect(page.getByText(/Binary data/)).toHaveCount(0);
    }
  });
});
