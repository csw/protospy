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
    // Table mode is the default (PRO-222); switch to rows mode for this block.
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
  // Table mode is now the default (PRO-222) — no need to switch in beforeEach.

  test("2.1 table header columns are visible", async ({ page }) => {
    await expect(page.getByText("Method")).toBeVisible();
    await expect(page.getByText("Status")).toBeVisible();
    await expect(page.getByText("Path")).toBeVisible();
    await expect(page.getByText("Time")).toBeVisible();
    await expect(page.getByText("Size")).toBeVisible();
    // The When header is a toggle button. Its accessible name comes from
    // aria-label ("Time zone: local. Click to toggle."); the visible text
    // is "When (local)" or "When (UTC)".
    await expect(
      page.getByLabel(/Time zone: local\. Click to toggle/),
    ).toBeVisible();
    await expect(page.getByText(/^When \(local\)$/)).toBeVisible();
  });

  test("2.2 row data renders in table columns", async ({ page }) => {
    await injectExchanges(page, [
      makeGetRequest(1, "/api/items"),
      makeResponse(1, "200 OK", '{"items":[]}'),
    ]);

    await expect(page.getByText("GET").first()).toBeVisible();
    await expect(page.getByText("200 OK").first()).toBeVisible();
    await expect(page.getByText("/api/items").first()).toBeVisible();
    await expect(page.getByText("42ms").first()).toBeVisible();
  });

  test("2.3 compact density reduces row height", async ({ page }) => {
    await injectExchanges(page, [
      makeGetRequest(1, "/api/test"),
      makeResponse(1, "200 OK"),
    ]);

    // Regular density: 30px
    const rowBefore = page.locator("button[aria-selected]").first();
    await expect(rowBefore).toBeVisible();
    const heightBefore = await rowBefore.evaluate(
      (el) => el.getBoundingClientRect().height,
    );
    expect(heightBefore).toBe(30);

    // Toggle to compact via command palette
    await page.keyboard.press("Meta+k");
    await page.getByText("Toggle density").click();

    // Compact density: 24px
    const rowAfter = page.locator("button[aria-selected]").first();
    const heightAfter = await rowAfter.evaluate(
      (el) => el.getBoundingClientRect().height,
    );
    expect(heightAfter).toBe(24);
  });

  test("2.5 dual-size+encoding tag is fully rendered at default list width", async ({
    page,
  }) => {
    // Inject a gzipped response and seed decodedBytes so the size cell
    // renders `1.6KB/6.0KB (deflate)`-shape content — the worst case
    // called out on PRO-222.
    await injectExchanges(page, [
      makeGetRequest(1, "/api/items"),
      {
        exchange: { exchange_id: 1, timestamp: "2024-01-01T00:00:00Z" },
        direction: "Response",
        event: {
          type: "Response",
          status: "200 OK",
          version: "HTTP/1.1",
          headers: [
            { name: "Content-Type", value: "application/json" },
            { name: "Content-Encoding", value: "deflate" },
          ],
          elapsed_ms: 42,
          body: {
            type: "Data",
            content: {
              offset: 0,
              length: 1638,
              payload: { binary: "" },
            },
            trailers: null,
            at_end: true,
            total_bytes: 1638,
          },
        },
      },
    ]);

    // Seed decodedBytes via the store action exposed for the body pane.
    await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const store = (window as any).__test_store;
      store.getState().setBodyDecodedBytes(1, "response", 6144);
    });

    // The size cell should contain both halves and the encoding tag.
    const row = page.locator("button[aria-selected]").first();
    await expect(row).toContainText("1.6KB/6.0KB");
    await expect(row).toContainText("(deflate)");

    // And the size span must not be horizontally clipped: scrollWidth
    // should equal clientWidth (no truncation).
    const size = page.locator('[data-testid="exchange-size"]').first();
    const sizeMetrics = await size.evaluate((el: HTMLElement) => ({
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
    }));
    expect(sizeMetrics.scrollWidth).toBeLessThanOrEqual(
      sizeMetrics.clientWidth,
    );
  });

  test("2.6 long path gets a title tooltip with the full URI", async ({
    page,
  }) => {
    const longPath =
      "/api/v1/orders/customer/12345/items/sku-9876543210/history?since=2024-01-01";
    await injectExchanges(page, [
      makeGetRequest(1, longPath),
      makeResponse(1, "200 OK"),
    ]);

    const pathCell = page.locator('[data-testid="exchange-path"]').first();
    await expect(pathCell).toHaveAttribute("title", longPath);
  });

  test("2.4 mode switching preserves data", async ({ page }) => {
    await injectExchanges(page, [
      makeGetRequest(1, "/api/preserved"),
      makeResponse(1, "200 OK"),
    ]);

    await expect(page.getByText("/api/preserved").first()).toBeVisible();

    // Switch to rows
    await page.getByLabel("Rows mode").click();
    await expect(page.getByText("/api/preserved").first()).toBeVisible();
    // ... and back to table
    await page.getByLabel("Table mode").click();
    await expect(page.getByText("/api/preserved").first()).toBeVisible();
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
  test("11.1 pending exchange shows dashes", async ({ page }) => {
    // Only inject request, no response. Table mode is the default and
    // shows explicit status/elapsed columns.
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

    const status = page.getByText("500 Internal Server Error").first();
    await expect(status).toBeVisible();
    await expect(status).toHaveClass(/text-red/);
  });

  test("11.3 compact rows mode allocates full row height so content is not clipped", async ({
    page,
  }) => {
    // Table mode is the default — switch to rows for this rows-specific check.
    await page.getByLabel("Rows mode").click();

    await injectExchanges(page, [
      makeGetRequest(1, "/api/test"),
      makeResponse(1, "200 OK"),
    ]);

    // Toggle to compact
    await page.keyboard.press("Meta+k");
    await page.getByText("Toggle density").click();

    // The virtualizer wrapper div is the parent of the button; its inline height
    // is the authoritative rowHeight used for positioning. We check it matches
    // the value expected by the spec (66px) so content is not clipped.
    const wrapperHeight = await page
      .locator("button[aria-selected]")
      .first()
      .evaluate((el) => (el.parentElement as HTMLElement).style.height);
    expect(wrapperHeight).toBe("66px");
  });

  test("11.4 rows don't overlap at narrow viewport width", async ({ page }) => {
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

    // Compare the virtualizer wrapper divs (explicit height: rowHeight), not the
    // buttons inside them — buttons include a border-b that can push .bottom past
    // the next wrapper's .top by a sub-pixel amount.
    const boxes = await rows.evaluateAll((els) =>
      els.map((el) => {
        const wrapper = el.parentElement as HTMLElement;
        const r = wrapper.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom };
      }),
    );

    // Adjacent wrappers are placed at consecutive multiples of rowHeight so
    // wrapper[i].bottom should equal wrapper[i+1].top exactly.
    for (let i = 0; i < boxes.length - 1; i++) {
      expect(boxes[i].bottom).toBeLessThanOrEqual(boxes[i + 1].top + 1); // +1 px for sub-pixel rounding
    }
  });
});
