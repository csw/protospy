import { test, expect } from "@playwright/test";
import {
  getStoreState,
  injectExchanges,
  resetStore,
  waitForStore,
} from "./helpers/inject";
import { makeCompleteExchange } from "./fixtures/exchanges";

const DEFAULT_LIST_WIDTH_PERCENT = { rows: 38, table: 46 } as const;
const LIST_MIN_PERCENT = 26;
const INSPECTOR_MIN_PERCENT = 30;

const percentWidth = (width: number, percent: number) =>
  (width * percent) / 100;
const panelGroup = (page: import("@playwright/test").Page) =>
  page.locator('[data-slot="resizable-panel-group"]');

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

test.describe("Layout and resize", () => {
  test("9.1 both panels visible on initial load", async ({ page }) => {
    // Exchange list panel (left) and Inspector panel (right) both present
    await expect(page.getByText("Requests").first()).toBeVisible();
    await expect(page.getByText("Select a request to inspect")).toBeVisible();
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
    expect(Math.abs(movedBox!.x - initialBox!.x)).toBeGreaterThan(20);
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

    await handle.focus();
    await handle.press("Home");

    const clamped = await listPanel.boundingBox();
    expect(clamped).not.toBeNull();
    const groupBox = await panelGroup(page).boundingBox();
    expect(groupBox).not.toBeNull();
    const expectedMin = percentWidth(groupBox!.width, LIST_MIN_PERCENT);
    // AppShell uses the v2.4 scaffold behavior: percentage minSize on the list
    // Panel. Once the drag pushes past the minimum the width should sit at the
    // percentage clamp, not collapse toward zero.
    expect(clamped!.width).toBeGreaterThanOrEqual(expectedMin - 10);
    expect(clamped!.width).toBeLessThanOrEqual(expectedMin + 15);
    expect(clamped!.width).toBeLessThan(initial!.width);
  });

  test("9.6 drag separator to the rightmost edge keeps the inspector at its scaffold floor", async ({
    page,
  }) => {
    const handle = page.getByRole("separator");
    const listPanel = page.locator("[data-panel]").first();
    const inspectorPanel = page.locator("[data-panel]").last();
    const initialInspector = await inspectorPanel.boundingBox();
    expect(initialInspector).not.toBeNull();
    expect(initialInspector!.width).toBeGreaterThan(0);

    const groupBox = await panelGroup(page).boundingBox();
    expect(groupBox).not.toBeNull();
    await handle.focus();
    await handle.press("End");

    const clampedInspector = await inspectorPanel.boundingBox();
    const clampedList = await listPanel.boundingBox();
    expect(clampedInspector).not.toBeNull();
    expect(clampedList).not.toBeNull();

    const inspectorMin = percentWidth(groupBox!.width, INSPECTOR_MIN_PERCENT);
    // The scaffold does not cap the list with the old pixel helper. Instead the
    // inspector Panel pins minSize=30%, so dragging all the way right leaves the
    // inspector with its percentage floor and the list takes the remaining room.
    expect(clampedInspector!.width).toBeGreaterThanOrEqual(inspectorMin - 10);
    expect(clampedInspector!.width).toBeLessThanOrEqual(inspectorMin + 15);
    expect(clampedList!.width).toBeGreaterThanOrEqual(
      percentWidth(groupBox!.width, 100 - INSPECTOR_MIN_PERCENT) - 15,
    );
    expect(clampedInspector!.width).toBeLessThan(initialInspector!.width);
  });

  test("9.7 double-click separator resets list pane to default width", async ({
    page,
  }) => {
    const handle = page.getByRole("separator");
    const listPanel = page.locator("[data-panel]").first();

    await handle.focus();
    await handle.press("End");

    // Confirm the panel actually moved before we reset it.
    const movedBox = await listPanel.boundingBox();
    expect(movedBox).not.toBeNull();
    const groupBox = await panelGroup(page).boundingBox();
    expect(groupBox).not.toBeNull();
    const defaultWidth = percentWidth(
      groupBox!.width,
      DEFAULT_LIST_WIDTH_PERCENT.table,
    );
    expect(movedBox!.width).toBeGreaterThan(defaultWidth + 40);

    // Double-click the separator to reset.
    // Use raw mouse coordinates (same pattern as drag tests) to avoid the
    // 1px separator being obscured by the inspector panel's child elements.
    const resetBox = await handle.boundingBox();
    expect(resetBox).not.toBeNull();
    await page.mouse.dblclick(
      resetBox!.x + resetBox!.width / 2,
      resetBox!.y + resetBox!.height / 2,
    );

    // Default is table mode — the list panel should reset to the table default.
    await expect
      .poll(async () => (await listPanel.boundingBox())?.width ?? 0, {
        timeout: 3000,
      })
      .toBeCloseTo(defaultWidth, -1); // within ~5px

    // The store should also reflect the reset.
    const storedWidth = await getStoreState(page, "listWidth");
    expect((storedWidth as { table: number }).table).toBeCloseTo(
      DEFAULT_LIST_WIDTH_PERCENT.table,
      0,
    );
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
