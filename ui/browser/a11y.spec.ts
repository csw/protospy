import { test } from "./fixtures/coverage";
import type { TestInfo } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import type { Result } from "axe-core";
import { injectExchanges, resetStore, waitForStore } from "./helpers/inject";
import { makeCompleteExchange } from "./fixtures/exchanges";

// Advisory axe scan: violations are reported as warnings, not failures.
// a11y is low priority for protospy (no screen-reader target), so axe never
// blocks merge or fails pre-commit. The scan still runs the full WCAG tag set —
// including keyboard/focus rules, which remain the a11y bar — and records every
// violation as a console warning, a testInfo annotation (HTML report), and a
// JSON attachment for triage.
function reportViolations(violations: Result[], testInfo: TestInfo): void {
  for (const v of violations) {
    const summary = `${v.id} (${v.impact}): ${v.help} [${v.nodes.length} node(s)]`;
    testInfo.annotations.push({ type: "a11y-violation", description: summary });
    console.warn(`[a11y advisory] ${summary}`);
  }
  if (violations.length > 0) {
    console.warn(
      `[a11y advisory] ${violations.length} axe violation(s) in "${testInfo.title}" — advisory only, not blocking.`,
    );
  }
}

test.describe("Accessibility smoke (advisory)", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/info", (route) =>
      route.fulfill({ json: { services: [{ name: "test-backend" }] } }),
    );
    await page.route("**/service/test-backend/events", (route) =>
      route.fulfill({ contentType: "text/event-stream", body: "" }),
    );
    await page.goto("/");
    await waitForStore(page);
    await resetStore(page);
  });

  test("axe scan on the empty initial page", async ({ page }, testInfo) => {
    const { violations } = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    // Attach the raw report to the test results for triage.
    await testInfo.attach("axe-violations-empty.json", {
      body: JSON.stringify(violations, null, 2),
      contentType: "application/json",
    });

    reportViolations(violations, testInfo);
  });

  test("axe scan with an exchange selected", async ({ page }, testInfo) => {
    await injectExchanges(page, [
      ...makeCompleteExchange(1, "GET", "/api/movies", "200 OK", {
        ts: "2024-01-01T00:00:01Z",
      }),
    ]);
    await page.getByText("/api/movies").first().click();

    // Wait for the inspector to populate so axe sees the selected state.
    await page.getByText("Bodies").first().waitFor({ state: "visible" });

    const { violations } = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    await testInfo.attach("axe-violations-with-selection.json", {
      body: JSON.stringify(violations, null, 2),
      contentType: "application/json",
    });

    reportViolations(violations, testInfo);
  });
});
