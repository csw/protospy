import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

// Re-export the canonical scene matrix so specs can iterate cells without a
// running page. The dev-only `window.__test_scenes` harness (installed by
// main.tsx) is the runtime injection path; these helpers drive it.
export { SCENES, SUPPORTED_WIDTHS, type Scene } from "../../src/test/scenes";

interface SceneWindow {
  __test_scenes?: {
    list: () => unknown[];
    widths: readonly number[];
    apply: (id: string) => boolean;
    applyAndSettle: (id: string, settleMs?: number) => Promise<boolean>;
  };
}

/** Wait until the dev-only scene harness has been installed on window. */
export async function waitForSceneHarness(page: Page): Promise<void> {
  await page.waitForFunction(
    () => (window as SceneWindow).__test_scenes != null,
    undefined,
    { timeout: 10_000 },
  );
}

/**
 * Reset the store and apply a scene by id via `window.__test_scenes`. Throws
 * if the harness is missing or the scene id is unknown, so a typo fails loudly
 * rather than silently rendering the wrong cell.
 */
export async function applyScene(page: Page, id: string): Promise<void> {
  const ok = await page.evaluate((sceneId) => {
    const harness = (window as SceneWindow).__test_scenes;
    if (harness == null) return null;
    return harness.apply(sceneId);
  }, id);
  if (ok === null) {
    throw new Error(
      "window.__test_scenes harness not installed (is the test-harness build being served?)",
    );
  }
  if (!ok) {
    throw new Error(`Unknown scene id: ${id}`);
  }
}

/** The scene metadata exposed by the live harness (for parity assertions). */
export async function listScenes(page: Page): Promise<{ id: string }[]> {
  return page.evaluate(() => {
    const harness = (window as SceneWindow).__test_scenes;
    return (harness?.list() ?? []) as { id: string }[];
  });
}

export type ListPaneWidth = "min" | "wide";

/**
 * Drive the list pane to its minimum (clamped at the panel `minSize`) or wide
 * extent by dragging the resize separator. This is the list-pane "narrow" axis
 * from the fixture matrix — it is an interaction, not store state, because the
 * panel width is `defaultSize` at mount, not a value the store can push after
 * the fact. Returns the resulting list-pane width in px.
 */
export async function dragListPaneTo(
  page: Page,
  target: ListPaneWidth,
): Promise<number> {
  const handle = page.getByRole("separator");
  await expect(handle).toBeVisible();
  const box = await handle.boundingBox();
  if (box == null) throw new Error("resize separator has no bounding box");

  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  // Drag well past any clamp: 0 for min, viewport width for wide.
  const viewport = page.viewportSize();
  const endX = target === "min" ? 0 : (viewport?.width ?? 1920);

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(endX, startY, { steps: 10 });
  await page.mouse.up();

  const listPanel = page.locator("[data-panel]").first();
  const resultBox = await listPanel.boundingBox();
  return resultBox?.width ?? 0;
}
