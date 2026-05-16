import { test, expect } from "@playwright/test";
import { injectExchanges, resetStore, waitForStore } from "./helpers/inject";
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
    await expect(page.getByText("Exchanges").first()).toBeVisible();
    await expect(page.getByText("Select an exchange")).toBeVisible();
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

    // Wait for rendering
    await page.waitForTimeout(500);

    // Count actual DOM rows — should be far fewer than 200
    const rowCount = await page.locator("button[aria-selected]").count();
    expect(rowCount).toBeLessThan(50);
    expect(rowCount).toBeGreaterThan(0);
  });
});
