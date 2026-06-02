import { test, expect } from "@playwright/test";
import {
  getStoreState,
  injectExchanges,
  resetStore,
  waitForStore,
} from "./helpers/inject";
import { makeCompleteExchange } from "./fixtures/exchanges";

test.beforeEach(async ({ page }) => {
  await page.route("**/info", (route) =>
    route.fulfill({ json: { services: [{ name: "test-backend" }] } }),
  );
  await page.route("**/service/test-backend", (route) =>
    route.fulfill({ contentType: "text/event-stream", body: "" }),
  );
  await page.goto("/");
  await waitForStore(page);
  await resetStore(page);
});

test.describe("Layout and resize", () => {
  test("9.1 both panels visible on initial load", async ({ page }) => {
    // Exchange list panel (left) and Inspector panel (right) both present
    await expect(page.getByText("Requests").first()).toBeVisible();
    await expect(
      page.getByText("Select a request to inspect it"),
    ).toBeVisible();
  });

  test("9.2 resize divider is present and draggable", async ({ page }) => {
    const separator = page.getByRole("separator");
    await expect(separator).toBeVisible();
  });

  test("9.3 drag resize handle changes panel proportions", async ({ page }) => {
    const handle = page.getByRole("separator");
    await expect(handle).toBeVisible();

    const initialBox = await handle.boundingBox();
    expect(initialBox).not.toBeNull();
    const startX = initialBox!.x + initialBox!.width / 2;
    const startY = initialBox!.y + initialBox!.height / 2;

    // Drag using raw mouse coordinates to avoid actionability check on 1px element
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + 150, startY, { steps: 5 });
    await page.mouse.up();

    const movedBox = await handle.boundingBox();
    expect(movedBox).not.toBeNull();
    expect(Math.abs(movedBox!.x - initialBox!.x)).toBeGreaterThan(50);
  });

  test("9.4 drag separator to the leftmost edge clamps the list panel at minSize", async ({
    page,
  }) => {
    const handle = page.getByRole("separator");
    await expect(handle).toBeVisible();

    // react-resizable-panels marks each Panel root with [data-panel].
    // The list is the first panel; the inspector is the second.
    const listPanel = page.locator("[data-panel]").first();
    const initial = await listPanel.boundingBox();
    expect(initial).not.toBeNull();

    const handleBox = await handle.boundingBox();
    expect(handleBox).not.toBeNull();
    const startX = handleBox!.x + handleBox!.width / 2;
    const startY = handleBox!.y + handleBox!.height / 2;

    // Drag far to the left — past where any sane minSize would clamp.
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(0, startY, { steps: 10 });
    await page.mouse.up();

    const clamped = await listPanel.boundingBox();
    expect(clamped).not.toBeNull();
    // AppShell pins minSize=LIST_MIN_WIDTH (200px) on the list Panel. Once the
    // drag pushes past the minimum the width should sit at the clamp, not
    // collapse. Allow a few px of panel-library rounding around 200.
    expect(clamped!.width).toBeGreaterThanOrEqual(190);
    expect(clamped!.width).toBeLessThanOrEqual(215);
    expect(clamped!.width).toBeLessThan(initial!.width);
  });

  test("9.6 drag separator to the rightmost edge clamps both panes at their bounds", async ({
    page,
  }) => {
    const handle = page.getByRole("separator");
    const listPanel = page.locator("[data-panel]").first();
    const inspectorPanel = page.locator("[data-panel]").last();
    const initialInspector = await inspectorPanel.boundingBox();
    expect(initialInspector).not.toBeNull();
    expect(initialInspector!.width).toBeGreaterThan(0);

    const handleBox = await handle.boundingBox();
    expect(handleBox).not.toBeNull();
    const startX = handleBox!.x + handleBox!.width / 2;
    const startY = handleBox!.y + handleBox!.height / 2;

    // Drag far to the right
    const viewport = page.viewportSize();
    const viewportWidth = viewport?.width ?? 1280;
    const farRight = viewportWidth + 200;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(farRight, startY, { steps: 10 });
    await page.mouse.up();

    const clampedInspector = await inspectorPanel.boundingBox();
    const clampedList = await listPanel.boundingBox();
    expect(clampedInspector).not.toBeNull();
    expect(clampedList).not.toBeNull();

    // The list Panel pins maxSize=LIST_MAX_WIDTH ("65%"), so dragging the
    // separator all the way right caps the list at ~65% of the group rather
    // than letting it dominate the viewport.
    expect(clampedList!.width).toBeLessThanOrEqual(viewportWidth * 0.65 + 10);
    // The inspector Panel pins minSize=INSPECTOR_MIN_WIDTH (400px): even at the
    // widest list it keeps a content floor and never collapses toward zero.
    expect(clampedInspector!.width).toBeGreaterThanOrEqual(395);
    expect(clampedInspector!.width).toBeLessThan(initialInspector!.width);
  });

  test("9.7 double-click separator resets list pane to default width", async ({
    page,
  }) => {
    const handle = page.getByRole("separator");
    const listPanel = page.locator("[data-panel]").first();

    // Drag the separator well to the right to change the list panel width.
    const handleBox = await handle.boundingBox();
    expect(handleBox).not.toBeNull();
    const startX = handleBox!.x + handleBox!.width / 2;
    const startY = handleBox!.y + handleBox!.height / 2;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + 200, startY, { steps: 5 });
    await page.mouse.up();

    // Confirm the panel actually moved before we reset it.
    const movedBox = await listPanel.boundingBox();
    expect(movedBox).not.toBeNull();
    expect(movedBox!.width).toBeGreaterThan(380);

    // Double-click the separator to reset.
    // Use raw mouse coordinates (same pattern as drag tests) to avoid the
    // 1px separator being obscured by the inspector panel's child elements.
    const resetBox = await handle.boundingBox();
    expect(resetBox).not.toBeNull();
    await page.mouse.dblclick(
      resetBox!.x + resetBox!.width / 2,
      resetBox!.y + resetBox!.height / 2,
    );

    // The list panel should now be close to the rows-mode default (340px).
    await expect
      .poll(async () => (await listPanel.boundingBox())?.width ?? 0, {
        timeout: 3000,
      })
      .toBeCloseTo(340, -1); // within ~5px

    // The store should also reflect the reset.
    const storedWidth = await getStoreState(page, "listWidth");
    expect((storedWidth as { rows: number }).rows).toBe(340);
  });

  test("9.5 virtual scroll limits DOM nodes with many exchanges", async ({
    page,
  }) => {
    // Inject 200 exchanges
    const messages = [];
    for (let i = 1; i <= 200; i++) {
      messages.push(
        ...makeCompleteExchange(i, "GET", `/api/item/${i}`, "200 OK", {
          ts: `2024-01-01T00:${String(Math.floor(i / 60)).padStart(2, "0")}:${String(i % 60).padStart(2, "0")}Z`,
        }),
      );
    }
    await injectExchanges(page, messages);

    // Wait for the virtualized row count to stabilise inside the expected
    // window (more than zero, far fewer than the 200 injected). Polling
    // converges as soon as the virtualizer renders instead of waiting a
    // fixed 500ms.
    await expect
      .poll(() => page.locator("button[aria-selected]").count(), {
        timeout: 5000,
      })
      .toBeGreaterThan(0);
    const rowCount = await page.locator("button[aria-selected]").count();
    expect(rowCount).toBeLessThan(50);
  });
});
