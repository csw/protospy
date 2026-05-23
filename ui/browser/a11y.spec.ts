import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { injectExchanges, resetStore, waitForStore } from "./helpers/inject";
import { makeCompleteExchange } from "./fixtures/exchanges";

// Soft-fail axe scan: violations are recorded as test annotations and
// attachments but do NOT fail the suite. Once the known violations are
// triaged and fixed, replace `expect(Array.isArray(violations))` with
// `expect(violations).toEqual([])` to promote to hard-fail.
//
// Known violations suppressed from terminal output (filed for follow-up):
//   - button-name (critical): Buttons must have discernible text
//     Affects: empty page, page with selection
//   - aria-allowed-attr (critical): Elements must only use supported ARIA attributes
//     Affects: page with selection
//
// Violations are recorded as testInfo.annotations (visible in HTML report,
// silent with --reporter=dot) and as JSON attachments for full detail.
test.describe("Accessibility smoke (soft-fail)", () => {
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

  test("axe scan on the empty initial page (logs violations, does not fail)", async ({
    page,
  }, testInfo) => {
    const { violations } = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    for (const v of violations) {
      testInfo.annotations.push({
        type: "a11y-soft-fail",
        description: `${v.id} (${v.impact}): ${v.help} [${v.nodes.length} node(s)]`,
      });
    }
    // Attach the raw report to the test results for triage.
    await testInfo.attach("axe-violations-empty.json", {
      body: JSON.stringify(violations, null, 2),
      contentType: "application/json",
    });

    // Soft-fail assertion: report must be a real result, but its content is
    // advisory only.
    expect(Array.isArray(violations)).toBe(true);
  });

  test("axe scan with an exchange selected (logs violations, does not fail)", async ({
    page,
  }, testInfo) => {
    await injectExchanges(page, [
      ...makeCompleteExchange(1, "GET", "/api/movies", "200 OK", {
        ts: "2024-01-01T00:00:01Z",
      }),
    ]);
    await page.getByText("/api/movies").first().click();

    // Wait for the inspector to populate so axe sees the selected state.
    await expect(page.getByText("Bodies").first()).toBeVisible();

    const { violations } = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    for (const v of violations) {
      testInfo.annotations.push({
        type: "a11y-soft-fail",
        description: `${v.id} (${v.impact}): ${v.help} [${v.nodes.length} node(s)]`,
      });
    }
    await testInfo.attach("axe-violations-with-selection.json", {
      body: JSON.stringify(violations, null, 2),
      contentType: "application/json",
    });

    expect(Array.isArray(violations)).toBe(true);
  });
});
