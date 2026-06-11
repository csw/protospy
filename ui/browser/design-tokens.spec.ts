/**
 * design-tokens.spec.ts
 *
 * Spot-checks computed style values on key elements to guard against
 * cosmetic drift from the design spec (the issue that created PRO-160).
 * Not exhaustive — covers the highest-drift-risk properties surfaced by
 * the v2 design comparison.
 */

import { test, expect, type Page } from "@playwright/test";
import {
  injectExchanges,
  resetStore,
  setTheme,
  waitForStore,
} from "./helpers/inject";
import { makeCompleteExchange } from "./fixtures/exchanges";
import { applyScene, waitForSceneHarness } from "./helpers/scenes";

test.beforeEach(async ({ page }) => {
  await page.route("**/info", (route) =>
    route.fulfill({
      json: { services: [{ name: "test-backend" }] },
    }),
  );
  await page.route("**/service/test-backend/events", (route) =>
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
  async function expectIndicatorToken(
    page: Page,
    label: string,
    token: "--conn-open" | "--conn-connecting" | "--conn-down",
  ) {
    const labelEl = page.getByText(label, { exact: true }).first();
    await expect(labelEl).toBeVisible();

    const styles = await page
      .locator('[data-testid="indicator-dot"]')
      .first()
      .evaluate((dot, tokenName) => {
        const probe = document.createElement("div");
        document.body.appendChild(probe);

        probe.style.backgroundColor = `var(${tokenName})`;
        const expectedBackground = getComputedStyle(probe).backgroundColor;
        const actualBackground = getComputedStyle(dot).backgroundColor;

        probe.style.color = `var(${tokenName})`;
        const expectedText = getComputedStyle(probe).color;
        const actualText = getComputedStyle(dot.parentElement!).color;

        probe.remove();
        return {
          actualBackground,
          actualText,
          expectedBackground,
          expectedText,
        };
      }, token);

    expect(styles.actualBackground).toBe(styles.expectedBackground);
    expect(styles.actualText).toBe(styles.expectedText);
  }

  test("method badge uses mono font at correct weight and border-radius", async ({
    page,
  }) => {
    // Method badge is a rows-mode element; switch from default table mode.
    await page.getByLabel("Rows view").click();
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
    // v2.3 MethodBadge: tracking-wide (0.025em) at text-[10.5px] → 0.2625px.
    expect(styles.letterSpacing).toBe("0.2625px");
    expect(styles.borderRadius).toBe("3px");
  });

  test("status code uses design font size (text-sm = 11.5px)", async ({
    page,
  }) => {
    // status-code testid is a rows-mode element; switch from default table mode.
    await page.getByLabel("Rows view").click();
    const status = page.locator('[data-testid="status-code"]').first();
    await expect(status).toBeVisible();

    const fontSize = await status.evaluate(
      (el) => getComputedStyle(el).fontSize,
    );
    expect(fontSize).toBe("11.5px");
  });

  test("table header is sticky", async ({ page }) => {
    await page.getByLabel("Table view").click();

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

  test("filter input uses the scaffold's transparent chrome treatment", async ({
    page,
  }) => {
    const input = page.getByLabel("Filter requests");
    await expect(input).toBeVisible();

    const styles = await input.evaluate((el) => {
      const cs = getComputedStyle(el);
      return {
        backgroundColor: cs.backgroundColor,
        borderTopWidth: cs.borderTopWidth,
        height: cs.height,
      };
    });
    expect(styles.backgroundColor).toBe("rgba(0, 0, 0, 0)");
    expect(styles.borderTopWidth).toBe("0px");
    expect(styles.height).toBe("28px");
  });

  test("filter input keeps the scaffold mono text size", async ({ page }) => {
    const input = page.getByLabel("Filter requests");
    await expect(input).toBeVisible();

    const styles = await input.evaluate((el) => {
      const cs = getComputedStyle(el);
      return {
        fontFamily: cs.fontFamily,
        fontSize: cs.fontSize,
      };
    });
    expect(styles.fontFamily).toContain("JetBrains Mono");
    expect(styles.fontSize).toBe("11.5px");
  });

  test("stream live indicators resolve connection tokens in browser CSS", async ({
    page,
  }) => {
    await waitForSceneHarness(page);

    await applyScene(page, "stream-live");
    await expectIndicatorToken(page, "live", "--conn-open");

    await page.getByLabel("Pause stream").click();
    await expectIndicatorToken(page, "paused", "--conn-connecting");

    await applyScene(page, "stream-anthropic-error");
    await expectIndicatorToken(page, "disconnected", "--conn-down");
  });
});

test.describe("primitive on-state surfaces (PRO-321)", () => {
  test("segmented control: active item is raised bg-pane on a bg-sub track", async ({
    page,
  }) => {
    // The rows/table switch is a ToggleGroup type="single" rendered as a
    // segmented control. Its on-state must render via data-[state=on] (not
    // aria-pressed, which Radix strips for type="single"). Switch to rows mode
    // so the "Rows view" segment is the active one.
    await page.getByLabel("Rows view").click();

    const track = page.locator('[data-slot="toggle-group"]').first();
    const active = page.getByLabel("Rows view");
    const inactive = page.getByLabel("Table view");

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
});

test.describe("command palette tokens (PRO-326)", () => {
  test("command item label uses text-sm (11.5px)", async ({ page }) => {
    // Command items use the shadcn CommandItem text-sm size in the v2.4 chrome.
    await page.keyboard.press("Meta+k");
    await expect(page.getByRole("dialog")).toBeVisible();

    const label = page.getByText("Compact density", { exact: true });
    await expect(label).toBeVisible();

    const fontSize = await label.evaluate(
      (el) => getComputedStyle(el).fontSize,
    );
    expect(fontSize).toBe("11.5px");
  });

  test("selected command item uses the accent surface", async ({ page }) => {
    // The selected row inherits bg-accent + text-foreground from the CommandItem
    // primitive; the palette does not override the primitive's selected state.
    await page.keyboard.press("Meta+k");
    await expect(page.getByRole("dialog")).toBeVisible();

    // cmdk auto-selects the first item.
    const selected = page.locator('[cmdk-item][data-selected="true"]').first();
    await expect(selected).toBeVisible();

    // Compare the rendered background to a probe painted with the token, so
    // the assertion holds in both themes without hard-coding rgba strings.
    const { actual, expected } = await selected.evaluate((el) => {
      const probe = document.createElement("div");
      probe.style.backgroundColor = "var(--color-accent)";
      document.body.appendChild(probe);
      const expected = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return { actual: getComputedStyle(el).backgroundColor, expected };
    });
    expect(actual).toBe(expected);
  });

  test("empty-state copy uses the command text-sm token (11.5px)", async ({
    page,
  }) => {
    // The palette's no-results copy shares the empty-state treatment via the
    // CommandEmpty children (not a nested EmptyState wrapper). Its size must be
    // the 11.5px text-sm command primitive size, not a browser default.
    await page.keyboard.press("Meta+k");
    await expect(page.getByRole("dialog")).toBeVisible();

    const input = page.getByPlaceholder("Run a command…");
    await input.fill("zzzznomatch");

    const empty = page.getByText("No matching command.");
    await expect(empty).toBeVisible();

    const fontSize = await empty.evaluate(
      (el) => getComputedStyle(el).fontSize,
    );
    expect(fontSize).toBe("11.5px");
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

  test("JSON syntax color tokens resolve to concrete colors in both themes", async ({
    page,
  }) => {
    const tokens = [
      "--color-json-key",
      "--color-json-string",
      "--color-json-number",
      "--color-json-boolean",
      "--color-json-null",
      "--color-json-punct",
      "--color-json-lineno",
    ];
    const sentinel = "rgb(1, 2, 3)";

    async function readResolvedColors() {
      return page.evaluate(
        ({ names, inheritedSentinel }) => {
          return names.map((token) => {
            const parent = document.createElement("div");
            const child = document.createElement("div");
            parent.style.color = inheritedSentinel;
            child.style.color = `var(${token})`;
            parent.appendChild(child);
            document.body.appendChild(parent);

            const inherited = getComputedStyle(parent).color;
            const resolved = getComputedStyle(child).color;

            parent.remove();
            return { token, inherited, resolved };
          });
        },
        { names: tokens, inheritedSentinel: sentinel },
      );
    }

    for (const theme of ["light", "dark"] as const) {
      await setTheme(page, theme);
      const results = await readResolvedColors();

      for (const { token, inherited, resolved } of results) {
        expect(
          inherited,
          `test sentinel should be the inherited color in ${theme} theme`,
        ).toBe(sentinel);
        expect(
          resolved,
          `${token} should resolve to an rgb color in ${theme} theme`,
        ).toMatch(/^rgba?\(/);
        expect(
          resolved,
          `${token} should not inherit the sentinel in ${theme} theme`,
        ).not.toBe(inherited);
      }
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

    // In Light, --color-border is #e3e6ec = rgb(227, 230, 236)
    expect(borderColor).toBe("rgb(227, 230, 236)");
  });

  test("default border color uses theme border token (dark)", async ({
    page,
  }) => {
    // Switch to dark theme and verify the border token follows
    await setTheme(page, "dark");

    const borderColor = await page.evaluate(() => {
      const el = document.createElement("div");
      document.body.appendChild(el);
      const resolved = getComputedStyle(el).borderColor;
      el.remove();
      return resolved;
    });

    // In Dark, --color-border is #1c222b = rgb(28, 34, 43)
    expect(borderColor).toBe("rgb(28, 34, 43)");
  });
});
