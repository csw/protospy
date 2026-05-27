/**
 * design-tokens.spec.ts
 *
 * Spot-checks computed style values on key elements to guard against
 * cosmetic drift from the design spec (the issue that created PRO-160).
 * Not exhaustive — covers the highest-drift-risk properties surfaced by
 * the v2 design comparison.
 */

import { test, expect } from "@playwright/test";
import { injectExchanges, resetStore, waitForStore } from "./helpers/inject";
import { makeCompleteExchange } from "./fixtures/exchanges";

test.beforeEach(async ({ page }) => {
  await page.route("**/info", (route) =>
    route.fulfill({
      json: { services: [{ name: "test-backend" }] },
    }),
  );
  await page.route("**/service/test-backend", (route) =>
    route.fulfill({
      contentType: "text/event-stream",
      body: "",
    }),
  );
  await page.goto("/");
  await waitForStore(page);
  await resetStore(page);

  const [req, res] = makeCompleteExchange(
    1,
    "GET",
    "/movies/_search",
    "200 OK",
  );
  await injectExchanges(page, [req, res]);
});

test.describe("design token fidelity", () => {
  test("method badge uses mono font at correct weight and border-radius", async ({
    page,
  }) => {
    // The MethodBadge component (with data-testid="method-badge") renders
    // only in rows mode. Table mode (PRO-222 default) uses plain method
    // text.
    await page.getByLabel("Rows mode").click();

    const badge = page.locator('[data-testid="method-badge"]').first();
    await expect(badge).toBeVisible();

    const styles = await badge.evaluate((el) => {
      const cs = getComputedStyle(el);
      return {
        fontFamily: cs.fontFamily,
        fontWeight: cs.fontWeight,
        letterSpacing: cs.letterSpacing,
        borderRadius: cs.borderRadius,
      };
    });

    expect(styles.fontFamily).toContain("JetBrains Mono");
    expect(styles.fontWeight).toBe("600");
    // tracking-[0.04em] at text-ui-xs (10.5px) → 0.04 × 10.5 = 0.42px
    expect(styles.letterSpacing).toBe("0.42px");
    expect(styles.borderRadius).toBe("3px");
  });

  test("status code uses design font size (text-ui-sm = 11.5px)", async ({
    page,
  }) => {
    // The status-code testid is on the rows-mode badge; switch to rows mode.
    await page.getByLabel("Rows mode").click();

    const status = page.locator('[data-testid="status-code"]').first();
    await expect(status).toBeVisible();

    const fontSize = await status.evaluate(
      (el) => getComputedStyle(el).fontSize,
    );
    expect(fontSize).toBe("11.5px");
  });

  test("table header is sticky", async ({ page }) => {
    await page.getByLabel("Table mode").click();

    const header = page.locator('[data-testid="exchange-table-header"]');
    await expect(header).toBeVisible();

    const position = await header.evaluate(
      (el) => getComputedStyle(el).position,
    );
    expect(position).toBe("sticky");
  });

  test("inspector tab bar is 32px tall", async ({ page }) => {
    // Switch to rows mode so the method-badge testid is rendered (it's the
    // click target used to select the exchange and open the inspector).
    await page.getByLabel("Rows mode").click();

    // Select the exchange so the inspector renders with tabs
    await page.locator('[data-testid="method-badge"]').first().click();

    const tabList = page.locator('[data-testid="inspector-tab-list"]');
    await expect(tabList).toBeVisible();

    const height = await tabList.evaluate((el) => getComputedStyle(el).height);
    expect(height).toBe("32px");
  });

  test("filter input wrapper has 4px border-radius", async ({ page }) => {
    const wrapper = page.locator('[data-testid="filter-input-wrapper"]');
    await expect(wrapper).toBeVisible();

    const borderRadius = await wrapper.evaluate(
      (el) => getComputedStyle(el).borderRadius,
    );
    expect(borderRadius).toBe("4px");
  });
});
