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

    // Small NDJSON documents auto-expand within the 32 KB budget, so values
    // are visible without user interaction.
    await expect(viewer).toContainText('"login"');

    // Collapsing the first document hides its content and shows the badge.
    await viewer.getByRole("button").first().click();
    await expect(viewer).toContainText(/\d+ keys/);

    // The media-type slug confirms the correct body pane is active.
    await expect(page.getByText("ndjson").first()).toBeVisible();
  });
});

test.describe("BodyPane — truncated body render branch", () => {
  // These drive the real decode → Web Worker path (the worker's truncation
  // marking is otherwise only covered by the Node mock in body.decode.test.ts).
  // The scene injects a truncated body; decodeBody runs the real worker, which
  // best-effort-parses the prefix, marks the cut point, and ships the ancestor
  // IDs that keep the marker expanded — so asserting the rendered banner +
  // marker proves the whole path end-to-end.
  test("body-truncated scene renders the banner and in-tree marker", async ({
    page,
  }) => {
    await applyScene(page, "body-truncated");

    await expect(page.getByTestId("json-truncation-banner")).toBeVisible();
    await expect(page.getByTestId("json-truncation-marker")).toBeVisible();

    // The single-document banner copy (not the multi-document NDJSON variant).
    await expect(page.getByTestId("json-truncation-banner")).toContainText(
      "valid prefix",
    );
  });

  test("body-truncated-ndjson scene renders the banner and marker on the last doc", async ({
    page,
  }) => {
    await applyScene(page, "body-truncated-ndjson");

    await expect(page.getByTestId("json-truncation-banner")).toBeVisible();
    await expect(page.getByTestId("json-truncation-marker")).toBeVisible();

    // The multi-document banner copy for an NDJSON forest.
    await expect(page.getByTestId("json-truncation-banner")).toContainText(
      "documents parsed so far",
    );
  });
});

test.describe("BodyPane — plain text render branch", () => {
  test("body-text scene renders the plain text body in a <pre> block", async ({
    page,
  }) => {
    await applyScene(page, "body-text");

    // makeTextResponse defaults to "OK\nService is healthy.\nVersion: 1.4.2".
    // BodyPane renders text/plain content in the labelled TextView (PRO-420:
    // line-number gutter, no longer a bare <pre>).
    const text = page.getByLabel("Body text");
    await expect(text).toBeVisible();
    await expect(text).toContainText("Service is healthy.");

    // Confirm we are in the text branch, not JSON.
    await expect(page.getByLabel("JSON viewer")).toHaveCount(0);
  });
});
