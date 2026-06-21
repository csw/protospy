import { test, expect } from "./fixtures/coverage";
import { waitForStore } from "./helpers/inject";
import { SCENES, applyScene, waitForSceneHarness } from "./helpers/scenes";

// Tests for fixture-matrix scenes that carry an `interact` function. Store
// injection alone reaches the pre-interaction snapshot; these specs perform
// the interaction and assert the resulting visual state.
//
// The generated smoke-test loop at the top ensures every scene with `interact`
// is exercised automatically — add `interact` to a scene and it gets a free
// smoke test here. Named behavioral tests below assert specific post-interaction
// content for the cases where we want to verify correctness, not just absence
// of errors.

test.beforeEach(async ({ page }) => {
  await page.route("**/info", (route) =>
    route.fulfill({ json: { services: [] } }),
  );
  await page.goto("/");
  await waitForStore(page);
  await waitForSceneHarness(page);
});

// ---------------------------------------------------------------------------
// Smoke tests — generated from SCENES; every scene with interact runs here
// ---------------------------------------------------------------------------

const interactScenes = SCENES.filter((s) => s.interact != null);

for (const scene of interactScenes) {
  test(`[smoke] ${scene.id} — interact runs without error`, async ({
    page,
  }) => {
    await applyScene(page, scene.id);
    await scene.interact!(page);
  });
}

// ---------------------------------------------------------------------------
// Behavioral assertions — Exchange list row hover
// ---------------------------------------------------------------------------

test.describe("Exchange list — row hover", () => {
  test("hover scene — row enters :hover state", async ({ page }) => {
    const scene = SCENES.find((s) => s.id === "hover")!;
    await applyScene(page, scene.id);

    await scene.interact!(page);

    // Poll the browser's live `:hover` pseudo-class state rather than reading
    // it once: `.hover()` resolves when the synthetic mouse move dispatches,
    // but the engine may apply `:hover` a tick later, so a one-shot
    // querySelector races that application. `waitForFunction` retries until the
    // class is queryable (or the default timeout elapses and the test fails),
    // making the assertion robust without an artificial delay.
    await page.waitForFunction(
      () => document.querySelector('[role="option"]:hover') !== null,
    );
  });
});

// ---------------------------------------------------------------------------
// Behavioral assertions — StreamView play/pause
// ---------------------------------------------------------------------------

test.describe("StreamView — play/pause toggle", () => {
  test("Pause button flips to Resume after clicking Pause", async ({
    page,
  }) => {
    const scene = SCENES.find((s) => s.id === "stream-paused")!;
    await applyScene(page, scene.id);
    await scene.interact!(page);

    await expect(
      page.getByRole("button", { name: "Resume stream" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Pause stream" }),
    ).toHaveCount(0);
  });

  test("Resume button flips back to Pause after clicking Resume", async ({
    page,
  }) => {
    const scene = SCENES.find((s) => s.id === "stream-paused")!;
    await applyScene(page, scene.id);
    await scene.interact!(page); // → paused
    await page.getByRole("button", { name: "Resume stream" }).click(); // → playing

    await expect(
      page.getByRole("button", { name: "Pause stream" }),
    ).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Behavioral assertions — ChatStreamView transcript / events toggle
// ---------------------------------------------------------------------------

test.describe("ChatStreamView — transcript / events toggle", () => {
  test("transcript toggle renders assembled text output", async ({ page }) => {
    const scene = SCENES.find((s) => s.id === "stream-anthropic-transcript")!;
    await applyScene(page, scene.id);
    await scene.interact!(page);

    await expect(
      page.getByText("Hello! How can I help you today?"),
    ).toBeVisible();
  });

  test("events toggle hides transcript and shows event log", async ({
    page,
  }) => {
    const scene = SCENES.find((s) => s.id === "stream-anthropic-transcript")!;
    await applyScene(page, scene.id);
    await scene.interact!(page); // → transcript
    await page.getByRole("radio", { name: "events" }).click(); // → events

    await expect(
      page.getByText("Hello! How can I help you today?"),
    ).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------
// Behavioral assertions — Inspector Headers tab
// ---------------------------------------------------------------------------

test.describe("Inspector — Headers tab", () => {
  test("Headers tab renders side-by-side request and response headers", async ({
    page,
  }) => {
    const scene = SCENES.find((s) => s.id === "headers-selected")!;
    await applyScene(page, scene.id);
    await scene.interact!(page);

    await expect(page.getByText("Authorization").first()).toBeVisible();
    await expect(page.getByText("X-Forwarded-For").first()).toBeVisible();
    await expect(page.getByText("X-RateLimit-Limit").first()).toBeVisible();
    await expect(
      page.getByText("Strict-Transport-Security").first(),
    ).toBeVisible();
  });
});
