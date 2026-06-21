import { test, expect } from "./fixtures/coverage";
import { collectErrors } from "./helpers/errors";

// Drives the dev/test-only standalone harness (`#json-tree-harness`) so these
// phase-3 assertions (PRO-400) exercise the REAL production code path — the
// virtualizer, the NDJSON forest flatten, the truncation marker, and the radix
// context-menu + real `navigator.clipboard` — which the jsdom component tests
// (which stub clipboard) cannot. See docs/agents/testing.md, "Test the real
// production code path".

test.describe("JsonTreeViewer — NDJSON documents (PRO-400)", () => {
  test("renders each line as an independently-collapsible document", async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await page.goto("/#json-tree-harness");
    await page.getByTestId("fixture-ndjson").click();

    const viewer = page.getByLabel("JSON tree viewer");
    await expect(viewer).toBeVisible();

    // Each document is collapsed by default → its key-count badge shows and its
    // values stay hidden until expanded.
    await expect(viewer).toContainText("3 keys");
    await expect(viewer).toContainText("4 keys");
    await expect(viewer).not.toContainText("login");

    // Expanding the first document reveals only its content; the rest stay
    // collapsed (independent collapse state per document).
    await viewer.getByRole("button").first().click();
    await expect(viewer).toContainText("login");
    await expect(viewer).not.toContainText("logout");

    expect(errors).toEqual([]);
  });
});

test.describe("JsonTreeViewer — truncation (PRO-400)", () => {
  test("shows the banner and in-tree marker in both themes", async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await page.goto("/#json-tree-harness");
    await page.getByTestId("fixture-truncated").click();

    const banner = page.getByTestId("json-truncation-banner");
    const marker = page.getByTestId("json-truncation-marker");
    await expect(banner).toBeVisible();
    await expect(banner).toContainText(/truncated/i);
    await expect(marker).toBeVisible();

    // Survives a theme toggle (the amber caution token resolves in both themes).
    await page.getByTestId("toggle-theme").click();
    await expect(page.locator("html")).toHaveClass(/dark/);
    await expect(banner).toBeVisible();
    await expect(marker).toBeVisible();

    expect(errors).toEqual([]);
  });
});

test.describe("JsonTreeViewer — copy value / copy path (PRO-400)", () => {
  test("copies a node's path and value via the context menu", async ({
    page,
  }) => {
    await page.goto("/#json-tree-harness");
    // Record clipboard writes without granting real clipboard permission.
    await page.evaluate(() => {
      window.__clipboard = "";
      Object.defineProperty(navigator, "clipboard", {
        value: {
          writeText: (text: string) => {
            window.__clipboard = text;
            return Promise.resolve();
          },
        },
        configurable: true,
      });
    });

    // The "Small object" fixture is fully expanded by default, so leaf rows are
    // visible to right-click.
    await page.getByTestId("fixture-small").click();
    const viewer = page.getByLabel("JSON tree viewer");
    await expect(viewer).toContainText('"name"');

    // Copy path on the `name` leaf → "$.name".
    await viewer
      .locator("[data-index]")
      .filter({ hasText: '"name"' })
      .first()
      .click({ button: "right" });
    await page.getByRole("menuitem", { name: "Copy path" }).click();
    expect(await page.evaluate(() => window.__clipboard)).toBe("$.name");

    // Copy value on the `name` leaf → the pretty-printed string value.
    await viewer
      .locator("[data-index]")
      .filter({ hasText: '"name"' })
      .first()
      .click({ button: "right" });
    await page.getByRole("menuitem", { name: "Copy value" }).click();
    expect(await page.evaluate(() => window.__clipboard)).toBe('"Alice"');
  });
});
