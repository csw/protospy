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
import {
  makeCompleteExchange,
  makeGetRequest,
  makeResponse,
} from "./fixtures/exchanges";

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

  test("filter input wrapper shows focus border color when input is focused", async ({
    page,
  }) => {
    const wrapper = page.locator('[data-testid="filter-input-wrapper"]');
    const input = wrapper.locator("input");
    await expect(input).toBeVisible();

    // Focus the input
    await input.focus();

    // border-border-focus is #2563eb in light = rgb(37, 99, 235)
    const borderColor = await wrapper.evaluate(
      (el) => getComputedStyle(el).borderColor,
    );
    expect(borderColor).toBe("rgb(37, 99, 235)");
  });

  test("filter input wrapper has 4px border-radius", async ({ page }) => {
    const wrapper = page.locator('[data-testid="filter-input-wrapper"]');
    await expect(wrapper).toBeVisible();

    const borderRadius = await wrapper.evaluate(
      (el) => getComputedStyle(el).borderRadius,
    );
    expect(borderRadius).toBe("4px");
  });

  test("search input text stays 12px at desktop width", async ({ page }) => {
    // The frozen-at-main search box is text-xs font-mono (12px). The Input base
    // primitive sets `text-base md:text-sm`, so SearchInput must carry BOTH
    // `text-xs` and `md:text-xs` to hold 12px at >=md widths. This guards
    // against a future "redundant class" cleanup of md:text-xs that would let
    // the base's md:text-sm (14px) win on every desktop width the app runs at.
    await page.setViewportSize({ width: 1280, height: 900 });
    const input = page.locator('[data-testid="filter-input-wrapper"] input');
    await expect(input).toBeVisible();

    const fontSize = await input.evaluate(
      (el) => getComputedStyle(el).fontSize,
    );
    expect(fontSize).toBe("12px");
  });

  test("search input clear button renders at 16px (icon-2xs)", async ({
    page,
  }) => {
    // The clear affordance uses Button size="icon-2xs" (size-4 = 16px) — the
    // honest size variant rather than icon-xs (24px) overridden back to 16px.
    const wrapper = page.locator('[data-testid="filter-input-wrapper"]');
    await wrapper.locator("input").fill("something");

    const clear = wrapper.getByRole("button", { name: "Clear filter" });
    await expect(clear).toBeVisible();

    const box = await clear.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { width: cs.width, height: cs.height };
    });
    expect(box.width).toBe("16px");
    expect(box.height).toBe("16px");
  });
});

test.describe("primitive on-state surfaces (PRO-321)", () => {
  test("segmented control: active item is raised bg-pane on a bg-sub track", async ({
    page,
  }) => {
    // The rows/table switch is a ToggleGroup type="single" rendered as a
    // segmented control. Its on-state must render via data-[state=on] (not
    // aria-pressed, which Radix strips for type="single"). Switch to rows mode
    // so the "Rows mode" segment is the active one.
    await page.getByLabel("Rows mode").click();

    const track = page.locator('[data-slot="toggle-group"]').first();
    const active = page.getByLabel("Rows mode");
    const inactive = page.getByLabel("Table mode");

    await expect(track).toBeVisible();
    // toHaveCSS auto-retries, so it settles past the `transition-colors`
    // animation that a one-shot getComputedStyle read would catch mid-flight.

    // Track is the bg-sub recess (#f4f5f7 light) the raised fill rises from.
    await expect(track).toHaveCSS("background-color", "rgb(244, 245, 247)");

    // Active segment is raised to bg-pane (#ffffff light) — no accent fill.
    // This is the regression guard: keyed off data-[state=on] (not aria-pressed,
    // which Radix strips for type="single"), so the on-fill actually renders.
    await expect(active).toHaveCSS("background-color", "rgb(255, 255, 255)");

    // Inactive segment stays transparent.
    await expect(inactive).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  });

  test("standalone Toggle: pressed on-state renders accent-soft fill + accent-ink text", async ({
    page,
  }) => {
    // The HeadersPane Basic-auth decode control is the first standalone Toggle
    // consumer (PRO-323). The default variant's on-state is keyed off
    // aria-pressed (not data-[state=on]) because a standalone Toggle is
    // tooltip-wrappable; toggle.tsx's NOTE requires this runtime check to prove
    // the aria-pressed selector actually matches, not just that the class exists.
    // "user:pass" → base64 "dXNlcjpwYXNz".
    await injectExchanges(page, [
      makeGetRequest(2, "/auth-check", undefined, [
        { name: "authorization", value: "Basic dXNlcjpwYXNz" },
      ]),
      makeResponse(2, "200 OK", undefined, undefined, []),
    ]);
    await page.getByText("/auth-check").first().click();
    await page.getByRole("tab", { name: "Headers" }).click();

    const panel = page.locator('[data-testid="headers-panel-request"]');
    const toggle = panel.getByLabel("Show decoded Basic auth value");
    await expect(toggle).toBeVisible();

    // Off-state: transparent fill (default variant resting surface).
    await expect(toggle).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");

    await toggle.click();

    // On-state (now aria-pressed): accent-soft fill + accent-ink text.
    // accent-soft #dbeafe = rgb(219, 234, 254); accent-ink #1d4ed8 = rgb(29, 78, 216).
    const pressed = panel.getByLabel("Hide decoded value");
    await expect(pressed).toHaveCSS("background-color", "rgb(219, 234, 254)");
    await expect(pressed).toHaveCSS("color", "rgb(29, 78, 216)");
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
