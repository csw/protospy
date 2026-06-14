import { test, expect } from "@playwright/test";
import { waitForStore } from "./helpers/inject";
import { applyScene, waitForSceneHarness } from "./helpers/scenes";

// Tests for body-pane render branches introduced by the PRO-396 scene
// expansion. Each test injects the relevant scene and asserts that the
// correct branch of BodyPane is rendered. The fixture-matrix breadth check
// (fixture-matrix.spec.ts) confirms no console errors; these tests confirm
// the right content is visible.

test.beforeEach(async ({ page }) => {
  await page.route("**/info", (route) =>
    route.fulfill({ json: { services: [] } }),
  );
  await page.goto("/");
  await waitForStore(page);
  await waitForSceneHarness(page);
});

test.describe("BodyPane — decode-failed render branch", () => {
  test("body-decode-failed scene renders 'Could not decode body'", async ({
    page,
  }) => {
    await applyScene(page, "body-decode-failed");

    // The corrupt gzip payload triggers a DecompressionStream error that
    // useDecodeBody catches. BodyPane renders the decode-failure lifecycle
    // state instead of content. Wait for the async decode to settle.
    await expect(page.getByText("Could not decode body")).toBeVisible();

    // Neither JSON nor plain-text content should render.
    await expect(page.getByLabel("JSON viewer")).toHaveCount(0);
    await expect(page.locator("pre")).toHaveCount(0);
  });
});

test.describe("BodyPane — NDJSON document view", () => {
  test("ndjson scene renders a forest of collapsible documents", async ({
    page,
  }) => {
    await applyScene(page, "ndjson");

    const viewer = page.getByLabel("NDJSON viewer");
    await expect(viewer).toBeVisible();

    // Each NDJSON line is its own collapsed document tree (count badge shown,
    // values hidden until expanded).
    await expect(viewer).toContainText(/\d+ keys/);
    await expect(viewer).not.toContainText('"login"');

    // Expanding the first document reveals only its content.
    await viewer.getByRole("button").first().click();
    await expect(viewer).toContainText('"login"');

    // The media-type slug confirms the correct body pane is active.
    await expect(page.getByText("ndjson").first()).toBeVisible();
  });
});

test.describe("BodyPane — plain text render branch", () => {
  test("body-text scene renders the plain text body in a <pre> block", async ({
    page,
  }) => {
    await applyScene(page, "body-text");

    // makeTextResponse defaults to "OK\nService is healthy.\nVersion: 1.4.2".
    // BodyPane renders text/plain content in a <pre> block.
    await expect(page.locator("pre")).toBeVisible();
    await expect(page.locator("pre")).toContainText("Service is healthy.");

    // Confirm we are in the text branch, not JSON.
    await expect(page.getByLabel("JSON viewer")).toHaveCount(0);
  });
});
