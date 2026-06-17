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
import {
  makeCompleteExchange,
  makeGetRequest,
  makeResponse,
} from "./fixtures/exchanges";
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
    // Method badge is a rows-mode element; ensure rows (the default).
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
    // status-code testid is a rows-mode element; ensure rows (the default).
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

  test("chrome sub-header strips track the h-strip token, decoupled from h-tab", async ({
    page,
  }) => {
    // h-strip resolves to --strip-h (32px regular / 28px compact). Assert each
    // strip's rendered height equals the resolved --strip-h *token* rather than a
    // hardcoded pixel value: if --strip-h later diverges from the tab strip's
    // --tab-h, this follows the token and a stale h-tab usage would fail. Cover
    // two structural shapes (grid toolbar + flex pane head) and both densities.
    await page.locator("button[role='option']").first().click();

    const readStrip = (testid: string) =>
      page
        .locator(`[data-testid="${testid}"]`)
        .first()
        .evaluate((el) => ({
          height: getComputedStyle(el).height,
          stripToken: getComputedStyle(document.documentElement)
            .getPropertyValue("--strip-h")
            .trim(),
        }));

    const toolbar = await readStrip("list-toolbar");
    const paneHead = await readStrip("body-pane-subhead");
    expect(toolbar.stripToken).toBe("32px");
    expect(toolbar.height).toBe(toolbar.stripToken);
    expect(paneHead.height).toBe(paneHead.stripToken);

    await page.evaluate(() => {
      (
        window as unknown as {
          __test_store: { getState: () => { setDensity: (d: string) => void } };
        }
      ).__test_store
        .getState()
        .setDensity("compact");
    });

    const toolbarCompact = await readStrip("list-toolbar");
    const paneHeadCompact = await readStrip("body-pane-subhead");
    expect(toolbarCompact.stripToken).toBe("28px");
    expect(toolbarCompact.height).toBe(toolbarCompact.stripToken);
    expect(paneHeadCompact.height).toBe(paneHeadCompact.stripToken);
  });

  test("body view-mode toggle item tracks the --toggle-item-h token across densities", async ({
    page,
  }) => {
    // The selector item height is h-toggle-item → --toggle-item-h = calc(
    // --strip-h - 14px) (18px regular / 14px compact). Derive the expectation
    // from the resolved --strip-h rather than a literal, so the assertion follows
    // the strip if it diverges or density changes — the coupling the review
    // flagged. (getPropertyValue returns the unresolved calc() string for the
    // token itself, so we compute the expected value from --strip-h.)
    await applyScene(page, "selected");

    const readItem = () =>
      page.getByText("Tree", { exact: true }).evaluate((el) => {
        const strip = parseInt(
          getComputedStyle(document.documentElement)
            .getPropertyValue("--strip-h")
            .trim(),
          10,
        );
        return {
          height: getComputedStyle(el).height,
          expected: `${strip - 14}px`,
        };
      });

    const regular = await readItem();
    expect(regular.expected).toBe("18px");
    expect(regular.height).toBe(regular.expected);

    await page.evaluate(() => {
      (
        window as unknown as {
          __test_store: { getState: () => { setDensity: (d: string) => void } };
        }
      ).__test_store
        .getState()
        .setDensity("compact");
    });

    const compact = await readItem();
    expect(compact.expected).toBe("14px");
    expect(compact.height).toBe(compact.expected);
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

test.describe("body pane divider (PRO-382)", () => {
  test("body split divider uses border-strong token in both themes", async ({
    page,
  }) => {
    // Select an exchange so the inspector renders with the bodies tab (default).
    await page.locator("button[role='option']").first().click();

    const divider = page.locator('[data-testid="body-split-divider"]');
    await expect(divider).toBeVisible();

    for (const theme of ["light", "dark"] as const) {
      await setTheme(page, theme);

      // Compare the rendered background to a probe painted with the token so
      // the assertion holds in both themes without hard-coding rgba strings.
      const { actual, expected } = await divider.evaluate((el) => {
        const probe = document.createElement("div");
        probe.style.backgroundColor = "var(--color-border-strong)";
        document.body.appendChild(probe);
        const expected = getComputedStyle(probe).backgroundColor;
        probe.remove();
        return { actual: getComputedStyle(el).backgroundColor, expected };
      });

      expect(
        actual,
        `body split divider should use --color-border-strong in ${theme} theme`,
      ).toBe(expected);
    }
  });
});

test.describe("line-variant tabs and standalone Toggle (PRO-378)", () => {
  test("line-variant active tab has transparent background (no card fill)", async ({
    page,
  }) => {
    // Select an exchange so the inspector renders with the line-variant tab strip.
    await page.locator("button[role='option']").first().click();

    const tabList = page.locator('[data-testid="inspector-tab-list"]');
    await expect(tabList).toBeVisible();

    // The active tab must have no background fill — the ::after underline bar
    // is the only active-state visual for the line variant.  This guards the
    // group-data compound selector chain that jsdom class-string tests can't
    // prove resolves correctly in browser CSS.
    const activeTab = tabList
      .locator('[data-slot="tabs-trigger"][data-state="active"]')
      .first();
    await expect(activeTab).toBeVisible();

    await expect(activeTab).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  });

  test("standalone Toggle pressed state applies non-transparent background (PRO-378)", async ({
    page,
  }) => {
    // The density icon toggle (top bar) is a standalone Toggle with the default
    // variant.  In unpressed state its background must be transparent; in pressed
    // state the aria-pressed:bg-primary/10 selector must fire and produce a
    // visible fill.  This guards the class-string-only coverage in Toggle.test.tsx.
    const densityBtn = page.getByLabel("Regular density — click for compact");
    await expect(densityBtn).toBeVisible();
    await expect(densityBtn).toHaveAttribute("aria-pressed", "false");

    // Unpressed: transparent ghost background.
    await expect(densityBtn).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");

    // Activate compact density.
    await densityBtn.click();
    const pressedBtn = page.getByLabel("Compact density — click for regular");
    await expect(pressedBtn).toHaveAttribute("aria-pressed", "true");

    // Read the reference color from the token before using toHaveCSS so the
    // probe is not evaluated mid-transition.  Tailwind v4 /10 modifier =
    // color-mix(in oklab, <color> 10%, transparent).
    const expected = await page.evaluate(() => {
      const probe = document.createElement("div");
      probe.style.cssText =
        "position:fixed;top:-9999px;background-color:color-mix(in oklab,var(--color-primary) 10%,transparent)";
      document.body.appendChild(probe);
      const val = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return val;
    });
    // toHaveCSS auto-retries until the transition-colors animation settles
    // on the exact token-resolved value — guards both that the aria-pressed:
    // selector fired AND that --color-primary resolves to the correct hue.
    await expect(pressedBtn).toHaveCSS("background-color", expected);
  });
});

test.describe("mid-stream error status badge (PRO-388)", () => {
  test("mid-stream badge renders with the amber warning token in both themes", async ({
    page,
  }) => {
    // Verify that a mid-stream error (status received + connection broke) renders
    // with --color-client (amber) rather than --color-error (red) or --color-ok
    // (green) in both light and dark themes.
    await waitForSceneHarness(page);

    for (const theme of ["light", "dark"] as const) {
      await setTheme(page, theme);
      await applyScene(page, "error-midstream");

      const badge = page
        .locator('[data-testid="status-code"][data-error]')
        .first();
      await expect(badge).toBeVisible();
      await expect(badge).toHaveText("200 ✕");

      // Compare rendered color against a probe painted with --color-client so
      // the assertion holds in both themes without hard-coding rgba values.
      const { actual, expectedClient, expectedError } = await badge.evaluate(
        (el) => {
          const probe = document.createElement("div");
          document.body.appendChild(probe);

          probe.style.color = "var(--color-client)";
          const expectedClient = getComputedStyle(probe).color;

          probe.style.color = "var(--color-error)";
          const expectedError = getComputedStyle(probe).color;

          probe.remove();
          return {
            actual: getComputedStyle(el).color,
            expectedClient,
            expectedError,
          };
        },
      );

      expect(
        actual,
        `mid-stream badge should use --color-client (amber) in ${theme} theme`,
      ).toBe(expectedClient);
      expect(
        actual,
        `mid-stream badge should NOT use --color-error (red) in ${theme} theme`,
      ).not.toBe(expectedError);
    }
  });
});

test.describe("pure transport error badge (PRO-391)", () => {
  test("error badge renders with --color-error in both themes", async ({
    page,
  }) => {
    // Verify that a pure transport error (no HTTP status) renders the "Error"
    // badge chip with --color-error (§2.2 Status namespace) rather than any
    // other red token in both light and dark themes.
    await waitForSceneHarness(page);

    for (const theme of ["light", "dark"] as const) {
      await setTheme(page, theme);
      await applyScene(page, "error-row");

      const badge = page
        .locator('[data-testid="status-code"][data-error][data-slot="badge"]')
        .first();
      await expect(badge).toBeVisible();
      await expect(badge).toHaveText("Error");

      // Compare rendered color against a probe painted with --color-error so
      // the assertion holds in both themes without hard-coding rgba values.
      const { actual, expected } = await badge.evaluate((el) => {
        const probe = document.createElement("div");
        document.body.appendChild(probe);
        probe.style.color = "var(--color-error)";
        const expected = getComputedStyle(probe).color;
        probe.remove();
        return { actual: getComputedStyle(el).color, expected };
      });

      expect(
        actual,
        `transport error badge should use --color-error in ${theme} theme`,
      ).toBe(expected);
    }
  });
});

test.describe("headers decode Toggle (PRO-403)", () => {
  test("decode Toggle manages aria-pressed with ghost inactive and filled active state", async ({
    page,
  }) => {
    // The headers decode control is a standalone Toggle (icon-xs size) using the
    // default variant. This guards that:
    // (a) Radix Toggle correctly sets aria-pressed from the controlled `pressed`
    //     prop (not managed manually), and
    // (b) the default variant's aria-pressed:bg-primary/10 fires in real browser
    //     CSS when pressed (not suppressed by an override).
    //
    // "Basic dXNlcjpwYXNz" = Basic user:pass
    await injectExchanges(page, [
      makeGetRequest(1, "/api/secure", undefined, [
        { name: "Authorization", value: "Basic dXNlcjpwYXNz" },
      ]),
      makeResponse(1, "200 OK"),
    ]);

    // Select the exchange so the inspector renders.
    await page.locator("button[role='option']").first().click();
    await page.getByRole("tab", { name: "Headers" }).click();

    // Reveal the masked Authorization value so the decode Toggle appears.
    const reqPanel = page.locator('[data-testid="headers-panel-request"]');
    await reqPanel.getByLabel("Reveal value").click();

    const decodeToggle = reqPanel.getByLabel("Decode value");
    await expect(decodeToggle).toBeVisible();
    await expect(decodeToggle).toHaveAttribute("aria-pressed", "false");

    // Unpressed: transparent ghost background (inactive, matches eye-reveal Button).
    await expect(decodeToggle).toHaveCSS(
      "background-color",
      "rgba(0, 0, 0, 0)",
    );

    // Activate decode mode.
    await decodeToggle.click();
    const pressedToggle = reqPanel.getByLabel("Show raw value");
    await expect(pressedToggle).toHaveAttribute("aria-pressed", "true");

    // Pressed: bg-primary/10 fill via the default variant's aria-pressed selector.
    // Probe the token before toHaveCSS so the probe is not evaluated mid-transition.
    const expected = await page.evaluate(() => {
      const probe = document.createElement("div");
      probe.style.cssText =
        "position:fixed;top:-9999px;background-color:color-mix(in oklab,var(--color-primary) 10%,transparent)";
      document.body.appendChild(probe);
      const val = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return val;
    });
    await expect(pressedToggle).toHaveCSS("background-color", expected);
  });
});

test.describe("top-bar responsive layout (PRO-392)", () => {
  test("⌘K button grows to fill top-bar space at 1920px", async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });

    const jumpBtn = page.getByRole("button", { name: /jump to/i });
    await expect(jumpBtn).toBeVisible();

    const width = await jumpBtn.evaluate(
      (el) => el.getBoundingClientRect().width,
    );

    // At 1920px the button must grow well past its natural ~100px content width
    // to fill the empty space in the top bar, capped at max-w-xl (36rem).
    expect(width).toBeGreaterThan(350);
    expect(width).toBeLessThanOrEqual(600);
  });
});

test.describe("StreamErrorBanner tokens (PRO-385)", () => {
  test("banner background is visibly saturated in light mode", async ({
    page,
  }) => {
    await waitForSceneHarness(page);
    await setTheme(page, "light");
    await applyScene(page, "stream-error");

    const banner = page.getByTestId("stream-error-banner");
    await expect(banner).toBeVisible();

    // Probe the token-resolved background so the assertion is not hardcoded
    // against a specific rgb string — the browser resolves the color-mix.
    const expected = await page.evaluate(() => {
      const probe = document.createElement("div");
      probe.style.cssText =
        "position:fixed;top:-9999px;background-color:var(--color-error-bg)";
      document.body.appendChild(probe);
      const val = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return val;
    });

    // color-mix(in srgb, #b91c1c 20%, white) — lock in the exact resolved value
    // so any future token change to another pale tint is caught, not just a
    // reversion to the exact old hex.
    expect(expected).toBe("rgb(241, 210, 210)");
    await expect(banner).toHaveCSS("background-color", expected);
  });

  test("banner background is visible in dark mode", async ({ page }) => {
    await waitForSceneHarness(page);
    await setTheme(page, "dark");
    await applyScene(page, "stream-error");

    const banner = page.getByTestId("stream-error-banner");
    await expect(banner).toBeVisible();

    // Dark mode: color-mix(in srgb, #f87171 14%, transparent) — probe the token
    // so the assertion tracks the CSS rather than a hardcoded string.
    const expected = await page.evaluate(() => {
      const probe = document.createElement("div");
      probe.style.cssText =
        "position:fixed;top:-9999px;background-color:var(--color-error-bg)";
      document.body.appendChild(probe);
      const val = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return val;
    });

    await expect(banner).toHaveCSS("background-color", expected);
    // Guard: must not be transparent (token resolved to something visible).
    expect(expected).not.toBe("rgba(0, 0, 0, 0)");
  });

  test("banner has bottom clearance (mb-2) from pane edge", async ({
    page,
  }) => {
    await waitForSceneHarness(page);
    await applyScene(page, "stream-error");

    const banner = page.getByTestId("stream-error-banner");
    await expect(banner).toBeVisible();
    await expect(banner).toHaveCSS("margin-bottom", "8px");
  });
});
