import { test, expect } from "@playwright/test";
import { waitForStore, injectExchanges } from "./helpers/inject";
import { applyScene, waitForSceneHarness } from "./helpers/scenes";
import {
  makeGetRequest,
  makeTextResponse,
  makeResponse,
} from "./fixtures/exchanges";

// Browser coverage for the resizable request/response body split (PRO-422):
// drag handle presence, resize interaction, text-mode auto-sizing, and
// split reset on exchange navigation.

test.beforeEach(async ({ page }) => {
  await page.route("**/info", (route) =>
    route.fulfill({ json: { services: [] } }),
  );
  await page.goto("/");
  await waitForStore(page);
  await waitForSceneHarness(page);
});

/** Bounding box of one body pane header (identified by its "Request"/"Response" label). */
async function bodyPaneBox(
  page: import("@playwright/test").Page,
  title: "Request" | "Response",
) {
  const head = page.getByTestId("body-pane-subhead").filter({ hasText: title });
  await expect(head).toBeVisible();
  return head.boundingBox();
}

test.describe("BodySplit — drag handle (PRO-422)", () => {
  test("resize handle is present when an exchange is selected", async ({
    page,
  }) => {
    await applyScene(page, "selected");

    const handle = page.locator(
      '[data-testid="body-split"] [role="separator"]',
    );
    await expect(handle).toBeVisible();

    // The handle should be between the request and response panes.
    const reqBox = await bodyPaneBox(page, "Request");
    const resBox = await bodyPaneBox(page, "Response");
    const handleBox = await handle.boundingBox();
    expect(reqBox).not.toBeNull();
    expect(resBox).not.toBeNull();
    expect(handleBox).not.toBeNull();

    // Handle is between the two panes horizontally.
    expect(handleBox!.x).toBeGreaterThan(reqBox!.x);
    expect(handleBox!.x).toBeLessThan(resBox!.x + resBox!.width);
  });

  test("dragging the handle resizes both panes", async ({ page }) => {
    await applyScene(page, "selected");

    const handle = page.locator(
      '[data-testid="body-split"] [role="separator"]',
    );
    await expect(handle).toBeVisible();

    const handleBox = (await handle.boundingBox())!;
    const startX = handleBox.x + handleBox.width / 2;
    const startY = handleBox.y + handleBox.height / 2;

    const reqBefore = (await bodyPaneBox(page, "Request"))!;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + 120, startY, { steps: 8 });
    await page.mouse.up();

    const reqAfter = (await bodyPaneBox(page, "Request"))!;
    // Request pane grew wider after dragging right.
    expect(reqAfter.width).toBeGreaterThan(reqBefore.width + 50);
  });
});

test.describe("BodySplit — text-mode auto-sizing (PRO-422)", () => {
  test("request pane is narrower when exchange has no request body (text mode)", async ({
    page,
  }) => {
    // body-text: GET (no request body) + text/plain response — the heuristic
    // should give the request pane the minimum width and the response pane most.
    await applyScene(page, "body-text");

    // Wait for decode to complete (response pane shows text content).
    await expect(page.getByLabel("Body text")).toBeVisible();

    const reqBox = (await bodyPaneBox(page, "Request"))!;
    const resBox = (await bodyPaneBox(page, "Response"))!;

    // Response pane should be significantly wider than the request pane.
    expect(resBox.width).toBeGreaterThan(reqBox.width * 2);
  });

  test("split resets to 50/50 for JSON (tree) mode", async ({ page }) => {
    // 'selected' scene: JSON bodies → tree mode by default → 50/50 split.
    await applyScene(page, "selected");

    await expect(page.getByLabel("JSON viewer")).toBeVisible();

    const reqBox = (await bodyPaneBox(page, "Request"))!;
    const resBox = (await bodyPaneBox(page, "Response"))!;
    const total = reqBox.width + resBox.width;

    // Both panes should occupy roughly equal width (within 15% of center).
    const reqShare = reqBox.width / total;
    expect(reqShare).toBeGreaterThan(0.35);
    expect(reqShare).toBeLessThan(0.65);
  });
});

test.describe("BodySplit — split reset on navigation (PRO-422)", () => {
  test("split resets to the new exchange default when navigating", async ({
    page,
  }) => {
    // Inject two exchanges: one GET (no req body, text/plain response) and one
    // POST (JSON request + JSON response). Navigate to the GET first, drag the
    // handle all the way right, then navigate to the POST and confirm the split
    // returned to 50/50.
    await injectExchanges(page, [
      makeGetRequest(1, "/api/health"),
      makeTextResponse(1),
      makeGetRequest(2, "/api/data"),
      makeResponse(2, "200 OK", '{"ok":true}'),
    ]);

    // Select first exchange (GET /api/health).
    await page.getByText("/api/health").first().click();
    await expect(page.getByLabel("Body text")).toBeVisible();

    // Drag the handle far right to establish a non-default position.
    const handle = page.locator(
      '[data-testid="body-split"] [role="separator"]',
    );
    const box = (await handle.boundingBox())!;
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 200, cy, { steps: 8 });
    await page.mouse.up();

    const reqAfterDrag = (await bodyPaneBox(page, "Request"))!;
    expect(reqAfterDrag.width).toBeGreaterThan(50);

    // Navigate to the second exchange (GET /api/data → JSON tree mode → 50/50).
    await page.getByText("/api/data").first().click();
    await expect(page.getByLabel("JSON viewer")).toBeVisible();

    const reqAfterNav = (await bodyPaneBox(page, "Request"))!;
    const resAfterNav = (await bodyPaneBox(page, "Response"))!;
    const total = reqAfterNav.width + resAfterNav.width;

    // The split should have reset to approximately 50/50 for the JSON exchange.
    const reqShare = reqAfterNav.width / total;
    expect(reqShare).toBeGreaterThan(0.35);
    expect(reqShare).toBeLessThan(0.65);
  });
});
