import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";
import { injectExchanges, waitForStore } from "./helpers/inject";
import { applyScene, waitForSceneHarness } from "./helpers/scenes";
import {
  makeGetRequest,
  makeResponse,
  makeImageResponse,
} from "./fixtures/exchanges";

const TEAPOT_PNG = readFileSync(
  new URL("../src/test/fixtures/utah-teapot.png", import.meta.url),
);
const TEAPOT_BASE64 = TEAPOT_PNG.toString("base64");
const TEAPOT_WIRE_BYTES = TEAPOT_PNG.byteLength;

// Browser coverage for the per-pane view-mode framework (PRO-420): the mode
// selector in each body pane header strip, the binary summary state with its
// download button, the header-strip download, and live mode switching. These
// exercise the real DOM/store path the jsdom component tests cannot — an actual
// download fires, and the selector toggles re-render real content.

test.beforeEach(async ({ page }) => {
  await page.route("**/info", (route) =>
    route.fulfill({ json: { services: [] } }),
  );
  await page.goto("/");
  await waitForStore(page);
  await waitForSceneHarness(page);
});

// The response pane header strip (the binary scene's request is a GET with no
// body, so its only selector/download lives on the response side).
function responseHead(page: import("@playwright/test").Page) {
  return page.getByTestId("body-pane-subhead").filter({ hasText: "Response" });
}

test.describe("BodyPane — binary summary state (PRO-420)", () => {
  test("renders the summary with a download button and Summary/Hex segments", async ({
    page,
  }) => {
    await applyScene(page, "body-binary");

    const summary = page.getByTestId("body-summary");
    await expect(summary).toBeVisible();
    await expect(summary).toContainText("octet-stream");
    // The prominent in-summary download action.
    await expect(
      summary.getByRole("button", { name: "Download" }),
    ).toBeVisible();

    // Binary renders as a Summary | Hex group like every other kind; Summary is
    // the default and shows as the pressed segment.
    const head = responseHead(page);
    await expect(head.getByText("Summary", { exact: true })).toHaveAttribute(
      "data-state",
      "on",
    );
    await expect(head.getByText("Hex", { exact: true })).toBeVisible();
    // Non-image binary has nothing meaningful to copy.
    await expect(head.getByRole("button", { name: /copy/i })).toHaveCount(0);
  });

  test("the Summary/Hex segments switch the body between summary and hex", async ({
    page,
  }) => {
    await applyScene(page, "body-binary");
    const head = responseHead(page);
    const summarySeg = head.getByText("Summary", { exact: true });
    const hexSeg = head.getByText("Hex", { exact: true });

    await hexSeg.click();
    await expect(page.getByLabel("Hex viewer")).toBeVisible();
    await expect(page.getByTestId("body-summary")).toHaveCount(0);

    await summarySeg.click();
    await expect(page.getByTestId("body-summary")).toBeVisible();
    await expect(page.getByLabel("Hex viewer")).toHaveCount(0);
  });

  test("the header download button triggers a download", async ({ page }) => {
    await applyScene(page, "body-binary");

    const download = page.waitForEvent("download");
    await responseHead(page)
      .getByRole("button", { name: "Download body" })
      .click();
    const file = await download;
    // Filename derives from the request path basename (/api/download/artifact.bin).
    expect(file.suggestedFilename()).toBe("artifact.bin");
  });
});

test.describe("BodyPane — download filename (PRO-420 / PRO-413)", () => {
  test("derives the extension from a vendor +json content-type", async ({
    page,
  }) => {
    // The Elasticsearch msearch response is `application/vnd.elasticsearch+json`
    // and its path has no extension — the filename must still resolve to .json
    // (the standard browser algorithm), not the surprising .bin.
    await injectExchanges(page, [
      makeGetRequest(1, "/_msearch"),
      makeResponse(1, "200 OK", '{"took":1}', undefined, [
        {
          name: "Content-Type",
          value: "application/vnd.elasticsearch+json;compatible-with=8",
        },
      ]),
    ]);
    await page.getByText("/_msearch").first().click();

    const head = page
      .getByTestId("body-pane-subhead")
      .filter({ hasText: "Response" });
    const download = page.waitForEvent("download");
    await head.getByRole("button", { name: "Download body" }).click();
    const file = await download;
    expect(file.suggestedFilename()).toBe("_msearch.json");
  });
});

test.describe("BodyPane — image rendering (PRO-412)", () => {
  test.beforeEach(async ({ page }) => {
    await injectExchanges(page, [
      makeGetRequest(1, "/api/avatar.png"),
      makeImageResponse(1, TEAPOT_BASE64, TEAPOT_WIRE_BYTES),
    ]);
    await page.getByText("/api/avatar.png").first().click();
  });

  test("renders an <img> element in Rendered mode for an image body", async ({
    page,
  }) => {
    const img = page.getByRole("img", { name: "Image view" });
    await expect(img).toBeVisible();
    // Blob URL from the decoded bytes — must be non-empty.
    const src = await img.getAttribute("src");
    expect(src).toMatch(/^blob:/);
    // BodySummary placeholder must be absent once image renders.
    await expect(page.getByTestId("body-summary")).toHaveCount(0);
  });

  test("Rendered is the default and pressed segment in the mode selector", async ({
    page,
  }) => {
    const head = responseHead(page);
    await expect(head.getByText("Rendered", { exact: true })).toHaveAttribute(
      "data-state",
      "on",
    );
    await expect(head.getByText("Hex", { exact: true })).toBeVisible();
  });

  test("switching to Hex mode shows the hex dump and hides the image", async ({
    page,
  }) => {
    const head = responseHead(page);
    await head.getByText("Hex", { exact: true }).click();
    await expect(page.getByLabel("Hex viewer")).toBeVisible();
    await expect(page.getByRole("img", { name: "Image view" })).toHaveCount(0);
  });

  test("copy button for image body copies as image data via ClipboardItem", async ({
    page,
  }) => {
    // Record what ClipboardItem types are written, without real clipboard perms.
    await page.evaluate(() => {
      window.__clipboardImageTypes = [];
      Object.defineProperty(navigator, "clipboard", {
        value: {
          write: (items: ClipboardItem[]) => {
            window.__clipboardImageTypes = items.flatMap((i) => i.types);
            return Promise.resolve();
          },
        },
        configurable: true,
      });
    });

    await page.getByRole("button", { name: "Copy" }).click();
    await expect(page.getByText("Copied to clipboard")).toBeVisible();
    const types = await page.evaluate(() => window.__clipboardImageTypes);
    expect(types).toContain("image/png");
  });
});

test.describe("BodyPane — JSON mode selector (PRO-420)", () => {
  test("offers tree/text/hex and switches between them", async ({ page }) => {
    await applyScene(page, "selected");

    const head = responseHead(page);
    // Tree is the JSON default → its toggle is pressed.
    await expect(head.getByText("Tree", { exact: true })).toHaveAttribute(
      "data-state",
      "on",
    );
    await expect(page.getByLabel("JSON viewer")).toBeVisible();

    // Switch to Text → the decoded source renders.
    await head.getByText("Text", { exact: true }).click();
    await expect(page.getByLabel("Body text")).toBeVisible();
    await expect(page.getByLabel("JSON viewer")).toHaveCount(0);

    // Switch to Hex → the hex dump renders.
    await head.getByText("Hex", { exact: true }).click();
    await expect(page.getByLabel("Hex viewer")).toBeVisible();
  });
});
