import { test, expect } from "@playwright/test";
import { injectExchanges, waitForStore } from "./helpers/inject";
import { makeGetRequest, makeTextResponse } from "./fixtures/exchanges";

// Browser coverage for PRO-421: soft-wrap and compact gutter in TextView.
// These exercise real DOM layout that jsdom component tests cannot verify —
// scrollWidth vs clientWidth (overflow) and computed element widths (gutter).

test.beforeEach(async ({ page }) => {
  await page.route("**/info", (route) =>
    route.fulfill({ json: { services: [] } }),
  );
  await page.goto("/");
  await waitForStore(page);
});

test.describe("TextView — soft-wrap at a constrained pane width", () => {
  test("does not produce a horizontal scrollbar for a long unbroken line", async ({
    page,
  }) => {
    // A 300-char unbroken token (no spaces) — the hardest case for word-break.
    // Without `overflow-wrap: anywhere` this would overflow the body pane.
    const longToken = "x".repeat(300);
    await injectExchanges(page, [
      makeGetRequest(1, "/api/health"),
      makeTextResponse(1, longToken),
    ]);
    await page.getByText("/api/health").first().click();

    const bodyText = page.getByLabel("Body text");
    await expect(bodyText).toBeVisible();

    // Confirm no horizontal overflow: scrollWidth must not exceed clientWidth.
    const overflows = await bodyText.evaluate(
      (el) => el.scrollWidth > el.clientWidth,
    );
    expect(overflows).toBe(false);
  });

  test("does not produce a horizontal scrollbar for compact JSON text", async ({
    page,
  }) => {
    // Compact JSON has no natural word-break points — a stress test for wrap-anywhere.
    const compactJson = JSON.stringify(
      Object.fromEntries(
        Array.from({ length: 30 }, (_, i) => [
          `longKeyName${i}`,
          `longValueString${i}`,
        ]),
      ),
    );
    await injectExchanges(page, [
      makeGetRequest(1, "/api/data"),
      makeTextResponse(1, compactJson),
    ]);
    await page.getByText("/api/data").first().click();

    const bodyText = page.getByLabel("Body text");
    await expect(bodyText).toBeVisible();

    const overflows = await bodyText.evaluate(
      (el) => el.scrollWidth > el.clientWidth,
    );
    expect(overflows).toBe(false);
  });
});

test.describe("TextView — compact line-number gutter", () => {
  test("sizes the gutter narrowly for a small line count", async ({ page }) => {
    // 3 lines → 2ch minimum gutter width. With the old fixed w-10 (40px ≈ 5ch),
    // the gutter was always over-wide. A 2ch gutter is at most ~16px at 8px/ch.
    await injectExchanges(page, [
      makeGetRequest(1, "/api/health"),
      makeTextResponse(1, "OK\nService is healthy.\nVersion: 1.4.2"),
    ]);
    await page.getByText("/api/health").first().click();

    const bodyText = page.getByLabel("Body text");
    await expect(bodyText).toBeVisible();

    // The first gutter span has an inline width style based on line count.
    const gutterSpan = bodyText.locator("span").first();
    const widthPx = await gutterSpan.evaluate(
      (el) => el.getBoundingClientRect().width,
    );

    // At 2ch, monospace ~8px/ch → ~16px. Old w-10 was 40px. Assert narrower.
    expect(widthPx).toBeLessThan(40);
  });

  test("expands the gutter for a large line count", async ({ page }) => {
    // 200 lines → 3-digit count → 3ch gutter. The gutter should be wider than
    // for 3 lines, proving it scales with line count.
    const manyLines = Array.from(
      { length: 200 },
      (_, i) => `line ${i + 1}`,
    ).join("\n");
    await injectExchanges(page, [
      makeGetRequest(1, "/api/big"),
      makeTextResponse(1, manyLines),
    ]);
    await page.getByText("/api/big").first().click();

    const bodyText = page.getByLabel("Body text");
    await expect(bodyText).toBeVisible();

    const gutterSpan = bodyText.locator("span").first();
    const widthPx = await gutterSpan.evaluate(
      (el) => el.getBoundingClientRect().width,
    );

    // 3ch > 2ch — gutter grew to fit 3-digit line numbers.
    expect(widthPx).toBeGreaterThan(16);
  });
});
