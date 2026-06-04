import { test, expect } from "@playwright/test";
import { injectExchanges, resetStore, waitForStore } from "./helpers/inject";
import {
  makeGetRequest,
  makeResponse,
  makeCompleteExchange,
  makeRequestWithTrace,
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
});

// ---------------------------------------------------------------------------
// 1. Rows mode
// ---------------------------------------------------------------------------

test.describe("Exchange list — rows mode", () => {
  test.beforeEach(async ({ page }) => {
    // Default is now table mode; switch to rows for these tests.
    await page.getByLabel("Rows mode").click();
  });

  test("1.1 shows empty state when no exchanges", async ({ page }) => {
    await expect(page.getByText("No requests yet")).toBeVisible();
    await expect(
      page.getByText(
        "Traffic will appear here when requests flow through the proxy",
      ),
    ).toBeVisible();
  });

  test("1.2 exchanges render with method, status, path", async ({ page }) => {
    await injectExchanges(page, [
      makeGetRequest(1, "/api/movies"),
      makeResponse(1, "200 OK", '{"movies":[]}'),
    ]);

    await expect(page.getByText("GET").first()).toBeVisible();
    await expect(page.getByText("200 OK").first()).toBeVisible();
    await expect(page.getByText("/api/movies").first()).toBeVisible();
  });

  test("1.3 clicking a row selects it and shows inspector", async ({
    page,
  }) => {
    await injectExchanges(page, [
      makeGetRequest(1, "/api/movies"),
      makeResponse(1, "200 OK"),
    ]);

    // Before selection, inspector shows empty state
    await expect(
      page.getByText("Select a request to inspect it"),
    ).toBeVisible();

    // Click the exchange row
    await page.getByText("/api/movies").first().click();

    // Inspector should now show the exchange
    await expect(
      page.getByText("Select a request to inspect it"),
    ).not.toBeVisible();
    // Context bar should show the method and path
    await expect(
      page.locator("button[aria-selected='true']").first(),
    ).toBeVisible();
  });

  test("1.4 trace color rail shows on traced exchanges", async ({ page }) => {
    const traceId = "abcdef1234567890abcdef1234567890";
    await injectExchanges(page, [
      makeRequestWithTrace(1, traceId, "/api/traced"),
      makeResponse(1, "200 OK"),
    ]);

    // The row should have a colored left border (border-l-4 with traceColor)
    const row = page.locator("button[aria-selected]").first();
    await expect(row).toBeVisible();
    const borderColor = await row.evaluate(
      (el) => getComputedStyle(el).borderLeftColor,
    );
    // Should not be transparent — trace color is applied
    expect(borderColor).not.toBe("rgba(0, 0, 0, 0)");
    expect(borderColor).not.toBe("transparent");
  });

  test("1.5 multiple exchanges render in order", async ({ page }) => {
    await injectExchanges(page, [
      ...makeCompleteExchange(1, "GET", "/first", "200 OK", {
        ts: "2024-01-01T00:00:01Z",
      }),
      ...makeCompleteExchange(2, "POST", "/second", "201 Created", {
        ts: "2024-01-01T00:00:02Z",
      }),
      ...makeCompleteExchange(3, "DELETE", "/third", "204 No Content", {
        ts: "2024-01-01T00:00:03Z",
      }),
    ]);

    const rows = page.locator("button[aria-selected]");
    await expect(rows).toHaveCount(3);
  });
});

// ---------------------------------------------------------------------------
// 2. Table mode
// ---------------------------------------------------------------------------

test.describe("Exchange list — table mode", () => {
  test.beforeEach(async ({ page }) => {
    // Switch to table mode
    await page.getByLabel("Table mode").click();
  });

  test("2.1 table header columns are visible", async ({ page }) => {
    await expect(page.getByText("Method")).toBeVisible();
    await expect(page.getByText("Status")).toBeVisible();
    await expect(page.getByText("Path")).toBeVisible();
    await expect(page.getByText("Time")).toBeVisible();
    await expect(page.getByText("Size")).toBeVisible();
    await expect(page.getByText("When", { exact: true })).toBeVisible();
  });

  test("2.2 row data renders in table columns", async ({ page }) => {
    await injectExchanges(page, [
      makeGetRequest(1, "/api/items"),
      makeResponse(1, "200 OK", '{"items":[]}'),
    ]);

    await expect(page.getByText("GET").first()).toBeVisible();
    // Table mode shows numeric status code only; reason phrase is in tooltip
    await expect(
      page.locator("button[role='option'] span", { hasText: /^200$/ }).first(),
    ).toBeVisible();
    await expect(page.getByText("/api/items").first()).toBeVisible();
    await expect(page.getByText("42ms").first()).toBeVisible();
  });

  test("2.3 compact density reduces row height", async ({ page }) => {
    await injectExchanges(page, [
      makeGetRequest(1, "/api/test"),
      makeResponse(1, "200 OK"),
    ]);

    // Measure row height at regular density
    const rowBefore = page.locator("button[aria-selected]").first();
    await expect(rowBefore).toBeVisible();
    const heightBefore = await rowBefore.evaluate(
      (el) => el.getBoundingClientRect().height,
    );

    // Toggle to compact via command palette
    await page.keyboard.press("Meta+k");
    await page.getByText("Toggle density").click();

    // Compact density should produce a shorter row
    const rowAfter = page.locator("button[aria-selected]").first();
    const heightAfter = await rowAfter.evaluate(
      (el) => el.getBoundingClientRect().height,
    );
    expect(heightAfter).toBeLessThan(heightBefore);
  });

  test("2.4 path cell shows tooltip with full URI on hover", async ({
    page,
  }) => {
    await injectExchanges(page, [
      makeGetRequest(1, "/api/very/long/path?q=search"),
      makeResponse(1, "200 OK"),
    ]);

    // Path cell displays path portion only
    const pathCell = page.locator("button[role='option'] span", {
      hasText: "/api/very/long/path",
    });
    await expect(pathCell).toBeVisible();

    // Hover to trigger Radix Tooltip — should show the full URI
    await pathCell.hover();
    await expect(page.getByRole("tooltip")).toHaveText(
      "/api/very/long/path?q=search",
    );
  });

  test("2.5 mode switching preserves data", async ({ page }) => {
    await injectExchanges(page, [
      makeGetRequest(1, "/api/preserved"),
      makeResponse(1, "200 OK"),
    ]);

    await expect(page.getByText("/api/preserved").first()).toBeVisible();

    // Switch back to rows
    await page.getByLabel("Rows mode").click();
    await expect(page.getByText("/api/preserved").first()).toBeVisible();
  });

  // Regression (PRO-286): the header tracks were sized for the *data* values
  // (GET / 200), so the spelled-out uppercase labels overflowed their cells and
  // butted together as "METHODSTATUSPATH". Each header label must now fit within
  // its grid track at every supported width.
  test("2.6 header labels fit their tracks without overflow", async ({
    page,
  }) => {
    await injectExchanges(page, [
      makeGetRequest(1, "/api/items"),
      makeResponse(1, "200 OK"),
    ]);

    const header = page.getByTestId("exchange-table-header");
    await expect(header).toBeVisible();

    for (const width of [1280, 1440, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      const overflows = await header.locator("span").evaluateAll((spans) =>
        spans.map((el) => ({
          label: el.textContent,
          overflow: el.scrollWidth - el.clientWidth,
        })),
      );
      for (const { label, overflow } of overflows) {
        expect(overflow, `"${label}" overflows its track at ${width}px`).toBe(
          0,
        );
      }
    }
  });

  // Regression (PRO-286): the sticky header is a sibling of the rail-offset row
  // container, so when the trace rail is present the header columns must shift by
  // the same 12px to stay aligned with the row cells beneath them.
  test("2.7 header columns align with row columns when trace rail present", async ({
    page,
  }) => {
    await injectExchanges(page, [
      makeRequestWithTrace(1, "a".repeat(32), "/api/traced"),
      makeResponse(1, "200 OK"),
    ]);

    const headerCells = page
      .getByTestId("exchange-table-header")
      .locator("span");
    const rowCells = page
      .locator("button[role='option']")
      .first()
      .locator("span");
    await expect(rowCells.first()).toBeVisible();

    const headerLefts = await headerCells.evaluateAll((els) =>
      els.map((el) => Math.round(el.getBoundingClientRect().left)),
    );
    const rowLefts = await rowCells.evaluateAll((els) =>
      els.map((el) => Math.round(el.getBoundingClientRect().left)),
    );

    expect(headerLefts).toHaveLength(rowLefts.length);
    headerLefts.forEach((left, i) => {
      // Within 1px to tolerate sub-pixel rounding.
      expect(Math.abs(left - rowLefts[i])).toBeLessThanOrEqual(1);
    });
  });
});

// ---------------------------------------------------------------------------
// 3. Sort order
// ---------------------------------------------------------------------------

test.describe("Sort order", () => {
  test("3.1 default order is newest first", async ({ page }) => {
    await injectExchanges(page, [
      ...makeCompleteExchange(1, "GET", "/older", "200 OK", {
        ts: "2024-01-01T00:00:01Z",
      }),
      ...makeCompleteExchange(2, "GET", "/newer", "200 OK", {
        ts: "2024-01-01T00:00:02Z",
      }),
    ]);

    // Default order is "newest" — /newer should appear first
    const rows = page.locator("button[aria-selected]");
    const firstRowText = await rows.first().textContent();
    expect(firstRowText).toContain("/newer");
  });

  test("3.2 toggle to oldest first", async ({ page }) => {
    await injectExchanges(page, [
      ...makeCompleteExchange(1, "GET", "/older", "200 OK", {
        ts: "2024-01-01T00:00:01Z",
      }),
      ...makeCompleteExchange(2, "GET", "/newer", "200 OK", {
        ts: "2024-01-01T00:00:02Z",
      }),
    ]);

    // Click sort toggle
    await page
      .getByLabel(/Sort order/)
      .first()
      .click();

    const rows = page.locator("button[aria-selected]");
    const firstRowText = await rows.first().textContent();
    expect(firstRowText).toContain("/older");
  });
});

// ---------------------------------------------------------------------------
// 11. Edge cases
// ---------------------------------------------------------------------------

test.describe("Edge cases", () => {
  test("11.1 pending exchange shows dashes in table mode", async ({ page }) => {
    // Table mode is the default — dashes are visible in status/elapsed columns.
    await injectExchanges(page, [makeGetRequest(1, "/api/pending")]);

    // Status should show "—" and elapsed should show "—"
    const dashes = page.getByText("—");
    await expect(dashes.first()).toBeVisible();
  });

  test("11.2 5xx errors show red status", async ({ page }) => {
    await injectExchanges(page, [
      makeGetRequest(1, "/api/fail"),
      makeResponse(1, "500 Internal Server Error"),
    ]);

    // Table mode (default) shows just the numeric code; look for "500"
    // within a table row's status cell.
    const status = page
      .locator("button[role='option'] span", { hasText: /^500$/ })
      .first();
    await expect(status).toBeVisible();
    await expect(status).toHaveClass(/text-red/);
  });

  test("11.3 compact rows mode sizes wrapper to fit content without clipping", async ({
    page,
  }) => {
    // This is a rows-mode test; switch from default table mode.
    await page.getByLabel("Rows mode").click();
    await injectExchanges(page, [
      makeGetRequest(1, "/api/test"),
      makeResponse(1, "200 OK"),
    ]);

    // Toggle to compact
    await page.keyboard.press("Meta+k");
    await page.getByText("Toggle density").click();

    // With dynamic measurement the virtualizer wrapper sizes to content.
    // The wrapper (parent of the button) should be at least as tall as the
    // button's rendered height so nothing is clipped.
    const { wrapperHeight, buttonHeight } = await page
      .locator("button[aria-selected]")
      .first()
      .evaluate((el) => {
        const wrapper = el.parentElement as HTMLElement;
        return {
          wrapperHeight: wrapper.getBoundingClientRect().height,
          buttonHeight: el.getBoundingClientRect().height,
        };
      });
    expect(wrapperHeight).toBeGreaterThanOrEqual(buttonHeight);
  });

  test("11.4 rows don't overlap at narrow viewport width", async ({ page }) => {
    // This is a rows-mode test; switch from default table mode.
    await page.getByLabel("Rows mode").click();
    await page.setViewportSize({ width: 420, height: 600 });
    await injectExchanges(page, [
      ...makeCompleteExchange(1, "GET", "/api/first", "200 OK", {
        ts: "2024-01-01T00:00:01Z",
      }),
      ...makeCompleteExchange(2, "POST", "/api/second", "201 Created", {
        ts: "2024-01-01T00:00:02Z",
      }),
      ...makeCompleteExchange(3, "DELETE", "/api/third", "204 No Content", {
        ts: "2024-01-01T00:00:03Z",
      }),
    ]);

    const rows = page.locator("button[role='option']");
    await expect(rows).toHaveCount(3);

    // Compare the virtualizer wrapper divs, not the buttons inside them —
    // buttons include a border-b that can push .bottom past the next
    // wrapper's .top by a sub-pixel amount.
    const boxes = await rows.evaluateAll((els) =>
      els.map((el) => {
        const wrapper = el.parentElement as HTMLElement;
        const r = wrapper.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom };
      }),
    );

    // Adjacent wrappers should not overlap: wrapper[i].bottom should be
    // at or before wrapper[i+1].top.
    for (let i = 0; i < boxes.length - 1; i++) {
      expect(boxes[i].bottom).toBeLessThanOrEqual(boxes[i + 1].top + 1); // +1 px for sub-pixel rounding
    }
  });
});
