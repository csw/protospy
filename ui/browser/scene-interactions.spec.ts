import { test, expect } from "@playwright/test";
import { waitForStore } from "./helpers/inject";
import { applyScene, waitForSceneHarness } from "./helpers/scenes";

// Tests for fixture-matrix scenes whose documented state requires a follow-up
// interaction (the `interaction:` field). Store injection alone reaches the
// pre-interaction state; these specs perform the interaction and assert the
// resulting visual state. Covers the regression risk the fixture-matrix breadth
// check cannot: that the interactive affordance actually works end-to-end.

test.beforeEach(async ({ page }) => {
  await page.route("**/info", (route) =>
    route.fulfill({ json: { services: [] } }),
  );
  await page.goto("/");
  await waitForStore(page);
  await waitForSceneHarness(page);
});

// ---------------------------------------------------------------------------
// StreamView — play/pause toggle
// ---------------------------------------------------------------------------

test.describe("StreamView — play/pause toggle", () => {
  test("clicking Pause freezes the event list and shows Resume", async ({
    page,
  }) => {
    await applyScene(page, "stream-live");

    // Pre-interaction: stream is playing, Pause button visible.
    const pauseBtn = page.getByRole("button", { name: "Pause stream" });
    await expect(pauseBtn).toBeVisible();

    await pauseBtn.click();

    // Post-interaction: stream is frozen, button flips to Resume.
    await expect(
      page.getByRole("button", { name: "Resume stream" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Pause stream" }),
    ).toHaveCount(0);
  });

  test("clicking Resume after Pause restores the playing state", async ({
    page,
  }) => {
    await applyScene(page, "stream-live");

    await page.getByRole("button", { name: "Pause stream" }).click();
    await expect(
      page.getByRole("button", { name: "Resume stream" }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Resume stream" }).click();

    await expect(
      page.getByRole("button", { name: "Pause stream" }),
    ).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// ChatStreamView — transcript / events toggle
// ---------------------------------------------------------------------------

test.describe("ChatStreamView — transcript / events toggle", () => {
  test("clicking transcript renders the assembled text output", async ({
    page,
  }) => {
    await applyScene(page, "stream-anthropic");

    // Pre-interaction: events tab active, transcript text not visible.
    await expect(
      page.getByText("Hello! How can I help you today?"),
    ).toHaveCount(0);

    await page.getByRole("radio", { name: "transcript" }).click();

    // Post-interaction: assembled transcript text visible.
    await expect(
      page.getByText("Hello! How can I help you today?"),
    ).toBeVisible();
  });

  test("clicking events after transcript switches back to the event log", async ({
    page,
  }) => {
    await applyScene(page, "stream-anthropic");

    await page.getByRole("radio", { name: "transcript" }).click();
    await expect(
      page.getByText("Hello! How can I help you today?"),
    ).toBeVisible();

    await page.getByRole("radio", { name: "events" }).click();

    await expect(
      page.getByText("Hello! How can I help you today?"),
    ).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------
// Inspector — Headers tab
// ---------------------------------------------------------------------------

test.describe("Inspector — Headers tab", () => {
  test("clicking Headers tab renders the side-by-side header columns", async ({
    page,
  }) => {
    await applyScene(page, "headers-selected");

    // Pre-interaction: Body tab active by default.
    await page.getByRole("tab", { name: "Headers" }).click();

    // Request headers visible.
    await expect(page.getByText("Authorization").first()).toBeVisible();
    await expect(page.getByText("X-Forwarded-For").first()).toBeVisible();

    // Response headers visible.
    await expect(page.getByText("X-RateLimit-Limit").first()).toBeVisible();
    await expect(
      page.getByText("Strict-Transport-Security").first(),
    ).toBeVisible();
  });
});
