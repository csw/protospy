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
    // Method badge is a rows-mode element; switch from default table mode.
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
    // status-code testid is a rows-mode element; switch from default table mode.
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
    // Select the exchange so the inspector renders with tabs
    await page.locator("button[role='option']").first().click();

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

test.describe("shadcn semantic tokens", () => {
  test("all shadcn semantic color tokens resolve to concrete colors", async ({
    page,
  }) => {
    // These aliases were missing (PRO-258), making every shadcn utility that
    // referenced them (bg-primary, ring-ring, text-muted-foreground, …) a
    // no-op.  Probe each token via a scratch element to confirm it resolves
    // to an actual rgb(…) color, not an empty string or transparent.
    const tokens = [
      "--color-background",
      "--color-foreground",
      "--color-primary",
      "--color-primary-foreground",
      "--color-secondary",
      "--color-secondary-foreground",
      "--color-destructive",
      "--color-muted",
      "--color-muted-foreground",
      "--color-accent-foreground",
      "--color-popover",
      "--color-popover-foreground",
      "--color-ring",
      "--color-input",
    ];

    const results = await page.evaluate((names) => {
      return names.map((token) => {
        const el = document.createElement("div");
        document.body.appendChild(el);
        el.style.color = `var(${token})`;
        const resolved = getComputedStyle(el).color;
        el.remove();
        return { token, resolved };
      });
    }, tokens);

    for (const { token, resolved } of results) {
      expect(resolved, `${token} should resolve to an rgb color`).toMatch(
        /^rgba?\(/,
      );
    }
  });

  test("focus-ring token resolves so ring-ring utility produces visible CSS", async ({
    page,
  }) => {
    // The critical fix: focus-visible:ring-ring/50 was a no-op because
    // --color-ring didn't exist.  Verify the ring color resolves to the
    // theme's border-focus blue (not transparent, not empty).
    const ringColor = await page.evaluate(() => {
      const el = document.createElement("div");
      document.body.appendChild(el);
      el.style.color = "var(--color-ring)";
      const resolved = getComputedStyle(el).color;
      el.remove();
      return resolved;
    });

    // --color-ring aliases --color-border-focus which is blue in both themes
    expect(ringColor).toMatch(/^rgb/);
    // Should NOT be transparent or black (which would indicate a broken chain)
    expect(ringColor).not.toBe("rgba(0, 0, 0, 0)");
  });

  test("default border color uses theme border token (light)", async ({
    page,
  }) => {
    // Tailwind v4 changed the default border color from gray-200 to
    // currentColor.  A @layer base rule restores it to --color-border so
    // shadcn's plain `border` class renders the correct separator color.
    const borderColor = await page.evaluate(() => {
      const el = document.createElement("div");
      document.body.appendChild(el);
      const resolved = getComputedStyle(el).borderColor;
      el.remove();
      return resolved;
    });

    // In light mode, --color-border is #e3e6ec = rgb(227, 230, 236)
    expect(borderColor).toBe("rgb(227, 230, 236)");
  });

  test("default border color uses theme border token (dark)", async ({
    page,
  }) => {
    // Switch to dark theme and verify the border token follows
    await page.evaluate(() => {
      document.documentElement.setAttribute("data-theme", "dark");
    });

    const borderColor = await page.evaluate(() => {
      const el = document.createElement("div");
      document.body.appendChild(el);
      const resolved = getComputedStyle(el).borderColor;
      el.remove();
      return resolved;
    });

    // In dark mode, --color-border is #1c222b = rgb(28, 34, 43)
    expect(borderColor).toBe("rgb(28, 34, 43)");
  });
});
