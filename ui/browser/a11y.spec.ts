import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { injectExchanges, resetStore, waitForStore } from "./helpers/inject";
import { makeCompleteExchange } from "./fixtures/exchanges";

// Hard-fail axe scan: any axe violation fails the test.
// Violations are also recorded as testInfo.annotations (HTML report) and
// JSON attachments for triage detail.
test.describe("Accessibility smoke", () => {
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

  test("axe scan on the empty initial page", async ({ page }, testInfo) => {
    const { violations } = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    for (const v of violations) {
      testInfo.annotations.push({
        type: "a11y-violation",
        description: `${v.id} (${v.impact}): ${v.help} [${v.nodes.length} node(s)]`,
      });
    }
    // Attach the raw report to the test results for triage.
    await testInfo.attach("axe-violations-empty.json", {
      body: JSON.stringify(violations, null, 2),
      contentType: "application/json",
    });

    expect(violations).toEqual([]);
  });

  test("axe scan with an exchange selected", async ({ page }, testInfo) => {
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
        type: "a11y-violation",
        description: `${v.id} (${v.impact}): ${v.help} [${v.nodes.length} node(s)]`,
      });
    }
    await testInfo.attach("axe-violations-with-selection.json", {
      body: JSON.stringify(violations, null, 2),
      contentType: "application/json",
    });

    expect(violations).toEqual([]);
  });
});
