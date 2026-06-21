import { test, expect } from "./fixtures/coverage";
import { injectExchanges, waitForStore } from "./helpers/inject";
import { makeGetRequest, makeTextResponse } from "./fixtures/exchanges";

// Browser coverage for PRO-416: the text view is virtualized so large bodies
// (CSV dumps, logs, bulk text) render without putting every line in the DOM.
// These exercise real DOM layout — the row count and scroll behavior depend on
// the virtualizer measuring the live scroll container, which jsdom cannot do.

test.beforeEach(async ({ page }) => {
  await page.route("**/info", (route) =>
    route.fulfill({ json: { services: [] } }),
  );
  await page.goto("/");
  await waitForStore(page);
});

test.describe("TextView — virtualization of large bodies", () => {
  test("renders only a windowed subset of rows for a large body", async ({
    page,
  }) => {
    // 50k lines: a frozen, non-virtualized <pre> would mount all 50k rows.
    const lineCount = 50_000;
    const body = Array.from(
      { length: lineCount },
      (_, i) => `line ${i + 1}: the quick brown fox jumps over the lazy dog`,
    ).join("\n");

    await injectExchanges(page, [
      makeGetRequest(1, "/api/log"),
      makeTextResponse(1, body),
    ]);
    // The render must complete well within the default action timeout — a
    // non-virtualized mount of 50k rows would blow past it.
    await page.getByText("/api/log").first().click();

    const bodyText = page.getByLabel("Body text");
    await expect(bodyText).toBeVisible();

    // Only the visible window plus overscan is in the DOM, far fewer than 50k.
    const renderedRows = await bodyText.getByTestId("line-number").count();
    expect(renderedRows).toBeGreaterThan(0);
    expect(renderedRows).toBeLessThan(200);
  });

  test("updates line numbers as the body scrolls", async ({ page }) => {
    const lineCount = 50_000;
    const body = Array.from(
      { length: lineCount },
      (_, i) => `line ${i + 1}`,
    ).join("\n");

    await injectExchanges(page, [
      makeGetRequest(1, "/api/log"),
      makeTextResponse(1, body),
    ]);
    await page.getByText("/api/log").first().click();

    const bodyText = page.getByLabel("Body text");
    await expect(bodyText).toBeVisible();

    // The first row's gutter starts at "1".
    const firstNumber = await bodyText
      .getByTestId("line-number")
      .first()
      .textContent();
    expect(firstNumber?.trim()).toBe("1");

    // Scroll the body pane down a long way. The aria-labelled element owns the
    // overflow, but BodyPane may wrap it — walk ancestors and take whatever
    // accepts the scrollTop, mirroring body-large.spec.ts.
    const applied = await bodyText.evaluate((el) => {
      let max = 0;
      let cur: HTMLElement | null = el as HTMLElement;
      while (cur) {
        cur.scrollTop = 20_000;
        if (cur.scrollTop > max) max = cur.scrollTop;
        cur = cur.parentElement;
      }
      return max;
    });
    expect(applied).toBeGreaterThan(1_000);

    // After scrolling, the topmost rendered line number is far past 1 —
    // proof the virtualizer recycled rows rather than rendering a static list.
    await expect
      .poll(async () => {
        const text = await bodyText
          .getByTestId("line-number")
          .first()
          .textContent();
        return Number(text?.trim() ?? "0");
      })
      .toBeGreaterThan(100);
  });

  test("soft-wraps long lines without horizontal overflow when virtualized", async ({
    page,
  }) => {
    // Mix a 400-char unbroken token among many lines so virtualization is
    // active and the wrapped row is the measured (variable-height) case.
    const lines = Array.from({ length: 2_000 }, (_, i) =>
      i === 0 ? "z".repeat(400) : `line ${i + 1}`,
    );
    await injectExchanges(page, [
      makeGetRequest(1, "/api/wrap"),
      makeTextResponse(1, lines.join("\n")),
    ]);
    await page.getByText("/api/wrap").first().click();

    const bodyText = page.getByLabel("Body text");
    await expect(bodyText).toBeVisible();

    const overflows = await bodyText.evaluate(
      (el) => el.scrollWidth > el.clientWidth,
    );
    expect(overflows).toBe(false);
  });
});
