import { test, expect } from "@playwright/test";
import {
  getStoreState,
  injectExchanges,
  resetStore,
  waitForStore,
} from "./helpers/inject";
import {
  makeGetRequest,
  makeResponse,
  makeCompleteExchange,
  makeRequestWithTrace,
  makeEncodedJsonResponse,
} from "./fixtures/exchanges";

// Minimal valid gzip base64 (content is irrelevant — the displayed wire size
// comes from the byte count argument, not the payload).
const GZIP_BASE64 =
  "H4sIAAAAAAAAE6tWyixJzS1WsoquVspMUbIy1FHKS8xNVbJSSswpyEhUqtWBiBvBxZNSSxKVamNrAXGp+bs6AAAA";

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
});

// ---------------------------------------------------------------------------
// 1. Rows view
// ---------------------------------------------------------------------------

test.describe("Exchange list — rows mode", () => {
  test.beforeEach(async ({ page }) => {
    // Default is now table mode; switch to rows for these tests.
    await page.getByLabel("Rows view").click();
  });

  test("1.1 shows empty state when no exchanges", async ({ page }) => {
    // Initial store connection is "connecting" (shows skeleton); set to "open"
    // to reach the first-run empty state this test targets.
    await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__test_store.getState().setConnection("open");
    });
    await expect(page.getByText("No requests yet")).toBeVisible();
    await expect(
      page.getByText(
        "Requests appear here as traffic flows through the proxy.",
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
    await expect(page.getByText("Select a request to inspect")).toBeVisible();

    // Click the exchange row
    await page.getByText("/api/movies").first().click();

    // Inspector should now show the exchange
    await expect(
      page.getByText("Select a request to inspect"),
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

    // The row carries a colored trace bar via a ::after pseudo-element whose
    // background is the per-trace color, selected by the data-trace attribute.
    const row = page.locator("button[aria-selected]").first();
    await expect(row).toBeVisible();
    expect(await row.getAttribute("data-trace")).toMatch(/^[1-7]$/);
    const traceColor = await row.evaluate(
      (el) => getComputedStyle(el, "::after").backgroundColor,
    );
    // Should not be transparent — the trace color is applied to the bar.
    expect(traceColor).not.toBe("rgba(0, 0, 0, 0)");
    expect(traceColor).not.toBe("transparent");
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

  test("1.6 rows-mode URI div shows tooltip with full URI on hover", async ({
    page,
  }) => {
    await injectExchanges(page, [
      makeGetRequest(1, "/api/very/long/path?q=search"),
      makeResponse(1, "200 OK"),
    ]);

    // The URI div in rows mode displays the full path+query as its text content
    const uriEl = page.locator("button[role='option'] div", {
      hasText: "/api/very/long/path?q=search",
    });
    await expect(uriEl).toBeVisible();

    // Hover to trigger Radix Tooltip — should show the full URI
    await uriEl.hover();
    await expect(page.getByRole("tooltip")).toHaveText(
      "/api/very/long/path?q=search",
    );
  });
});

// ---------------------------------------------------------------------------
// 2. Table view
// ---------------------------------------------------------------------------

test.describe("Exchange list — table mode", () => {
  test.beforeEach(async ({ page }) => {
    // Switch to table mode
    await page.getByLabel("Table view").click();
  });

  test("2.1 table header columns are visible", async ({ page }) => {
    await injectExchanges(page, [
      makeGetRequest(1, "/api/header"),
      makeResponse(1, "200 OK"),
    ]);

    await expect(page.getByText("Method")).toBeVisible();
    await expect(page.getByText("Status")).toBeVisible();
    await expect(page.getByText("Path")).toBeVisible();
    // ELAPSED = request→response duration; TIME = absolute timestamp.
    await expect(page.getByText("Elapsed", { exact: true })).toBeVisible();
    await expect(page.getByText("Size")).toBeVisible();
    await expect(page.getByText("Time", { exact: true })).toBeVisible();
  });

  test("2.2 row data renders in table columns", async ({ page }) => {
    await injectExchanges(page, [
      makeGetRequest(1, "/api/items"),
      makeResponse(1, "200 OK", '{"items":[]}'),
    ]);

    await expect(page.getByText("GET").first()).toBeVisible();
    // Table view shows numeric status code only; reason phrase is in tooltip
    await expect(
      page.locator("button[role='option'] span", { hasText: /^200$/ }).first(),
    ).toBeVisible();
    await expect(page.getByText("/api/items").first()).toBeVisible();
    // ELAPSED uses the canonical fmtMs formatter ("42 ms", with a space).
    await expect(page.getByText("42 ms").first()).toBeVisible();
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
    await page.getByText("Compact density").click();

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
    await page.getByLabel("Rows view").click();
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

    for (const width of [1024, 1280, 1440, 1920]) {
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

  // Regression (PRO-286): header and rows share one grid template. When the
  // lane-packed trace rail is present, both header and row tracks reserve the
  // same gutter width so their columns still line up.
  test("2.7 header columns align with row columns when trace rail is present", async ({
    page,
  }) => {
    await injectExchanges(page, [
      makeRequestWithTrace(1, "a".repeat(32), "/api/traced"),
      makeResponse(1, "200 OK"),
      makeRequestWithTrace(2, "a".repeat(32), "/api/traced/again"),
      makeResponse(2, "200 OK"),
    ]);

    // Scope to direct children: ":scope > button" pins to the six header sort
    // controls; ":scope > span" pins to the six row grid-track cells.
    const headerCells = page
      .getByTestId("exchange-table-header")
      .locator(":scope > button");
    const rowCells = page
      .locator("button[role='option']")
      .first()
      .locator(":scope > span");
    await expect(rowCells.first()).toBeVisible();
    await expect(headerCells).toHaveCount(6);
    await expect(rowCells).toHaveCount(6);

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

  test("2.8 trace rail bars scroll with the table rows", async ({ page }) => {
    const traceId = "abcdef1234567890abcdef1234567890";
    const messages = [];
    for (let id = 1; id <= 40; id += 1) {
      messages.push(
        makeRequestWithTrace(id, traceId, `/api/traced/${id}`),
        makeResponse(id, "200 OK"),
      );
    }
    await injectExchanges(page, messages);

    const railBar = page.getByRole("button", {
      name: `Filter to trace ${traceId}`,
    });
    await expect(railBar).toBeVisible();

    const before = await railBar.evaluate(
      (el) => el.getBoundingClientRect().top,
    );
    const scrollDelta = await railBar.evaluate((el) => {
      let cur = el.parentElement;
      while (cur) {
        const style = getComputedStyle(cur);
        if (/(auto|scroll)/.test(style.overflowY)) {
          cur.scrollTop = 300;
          return cur.scrollTop;
        }
        cur = cur.parentElement;
      }
      return 0;
    });
    await expect
      .poll(() => railBar.evaluate((el) => el.getBoundingClientRect().top))
      .toBeLessThan(before);
    const after = await railBar.evaluate(
      (el) => el.getBoundingClientRect().top,
    );

    expect(Math.abs(before - after - scrollDelta)).toBeLessThanOrEqual(2);
  });

  test("2.9 trace rail button is keyboard-focusable and filters in the browser", async ({
    page,
  }) => {
    const traceId = "abcdef1234567890abcdef1234567890";
    await injectExchanges(page, [
      makeRequestWithTrace(1, traceId, "/api/traced/1"),
      makeResponse(1, "200 OK"),
      ...makeCompleteExchange(2, "GET", "/api/other/2", "200 OK"),
      makeRequestWithTrace(3, traceId, "/api/traced/3"),
      makeResponse(3, "200 OK"),
      ...makeCompleteExchange(4, "GET", "/api/other/4", "200 OK"),
      makeRequestWithTrace(5, traceId, "/api/traced/5"),
      makeResponse(5, "200 OK"),
    ]);

    const railBar = page.getByRole("button", {
      name: `Filter to trace ${traceId}`,
    });
    await expect(railBar).toBeVisible();

    await page
      .getByTestId("exchange-table-header")
      .locator("button")
      .last()
      .focus();
    await page.keyboard.press("Tab");
    await expect(railBar).toBeFocused();

    const focusStyle = await railBar.evaluate((el) => {
      const cs = getComputedStyle(el);
      return {
        outlineColor: cs.outlineColor,
        outlineOffset: cs.outlineOffset,
        outlineStyle: cs.outlineStyle,
        outlineWidth: cs.outlineWidth,
      };
    });
    expect(focusStyle.outlineWidth).toBe("2px");
    expect(focusStyle.outlineOffset).toBe("2px");
    expect(focusStyle.outlineStyle).not.toBe("none");
    expect(focusStyle.outlineColor).not.toBe("rgba(0, 0, 0, 0)");

    await railBar.click();
    await expect.poll(() => getStoreState(page, "traceFilter")).toBe(traceId);
    await expect(page.locator("button[role='option']")).toHaveCount(3);
    await expect(page.getByText("/api/traced/1")).toBeVisible();
    await expect(page.getByText("/api/traced/3")).toBeVisible();
    await expect(page.getByText("/api/traced/5")).toBeVisible();
    await expect(page.getByText("/api/other/2")).not.toBeVisible();
    await expect(page.getByText("/api/other/4")).not.toBeVisible();
  });

  // Regression (PRO-286): the ELAPSED (duration) and TIME (absolute timestamp)
  // columns must never truncate their values, even for a large multi-digit
  // elapsed time, at every supported width. The timestamp previously clipped
  // because its track left ~0px slack at the data width.
  test("2.10 ELAPSED and TIME columns never truncate their values", async ({
    page,
  }) => {
    await injectExchanges(page, [
      makeGetRequest(1, "/api/slow", "2024-06-01T14:30:45.678Z"),
      // 5-digit elapsed (~99s) — a realistically large request duration.
      makeResponse(1, "200 OK", undefined, undefined, undefined, 98765),
    ]);

    const row = page.locator("button[role='option']").first();
    await expect(row).toBeVisible();
    const cells = row.locator(":scope > span");
    await expect(cells).toHaveCount(6);
    // Column order: METHOD · STATUS · PATH · ELAPSED · SIZE · TIME.
    const elapsed = cells.nth(3);
    const time = cells.nth(5);
    // fmtMs scales ≥1s to seconds: 98765ms → "98.8 s".
    await expect(elapsed).toHaveText("98.8 s");
    await expect(time).toHaveText(/^\d{2}:\d{2}:\d{2}\.\d{3}$/);

    for (const width of [1024, 1280, 1440, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      for (const [label, cell] of [
        ["ELAPSED", elapsed],
        ["TIME", time],
      ] as const) {
        // `scrollWidth` is always >= `clientWidth`, so it can only detect
        // overflow, never spare room. Measure the actual rendered text width
        // (via a Range) against the cell's content box to get real slack.
        const slack = await cell.evaluate((el) => {
          const range = document.createRange();
          range.selectNodeContents(el);
          const textWidth = range.getBoundingClientRect().width;
          const cs = getComputedStyle(el);
          const contentWidth =
            el.clientWidth -
            parseFloat(cs.paddingLeft) -
            parseFloat(cs.paddingRight);
          return contentWidth - textWidth;
        });
        // Require real breathing room (not merely "fits"), so a future
        // tightening of the track regresses this test rather than silently
        // returning to the ~0px-slack clipping that caused the bug.
        expect(
          slack,
          `${label} cell has insufficient slack at ${width}px`,
        ).toBeGreaterThanOrEqual(3);
      }
    }
  });

  // Regression (PRO-286): the SIZE column previously rendered the dual
  // wire/decoded size + inline "(encoding)" tag, which overflowed the fixed
  // track. It now shows a single bounded value + a compression marker icon,
  // with the breakdown in the tooltip — and must never truncate, even for a
  // large size.
  test("2.11 SIZE column shows a bounded value + marker and never truncates", async ({
    page,
  }) => {
    await injectExchanges(page, [
      makeGetRequest(1, "/api/big"),
      // ~4.8 MB on the wire, gzip-encoded.
      makeEncodedJsonResponse(1, GZIP_BASE64, 5_000_000, "gzip"),
    ]);

    const row = page.locator("button[role='option']").first();
    await expect(row).toBeVisible();
    const sizeCell = row.locator(":scope > span").nth(4);

    // Compression marker icon + tooltip with the encoding detail.
    await expect(sizeCell.locator("svg")).toBeVisible();
    await expect(sizeCell).toHaveAttribute("title", /gzip/);

    // The bounded value text (e.g. "4.8 MB") renders in full.
    const sizeText = sizeCell.locator(":scope > span");
    await expect(sizeText).toHaveText(/^\d+(\.\d+)? [KMGT]?B$/);

    // The whole cell content (marker icon + gap + value) must fit the track's
    // content box with real slack. Measure the union of the cell's contents via
    // a Range (intrinsic width, unaffected by the inner `truncate`) against the
    // cell's content box — the inner value span shrink-wraps its text, so
    // measuring slack on it alone would always read ~0.
    for (const width of [1024, 1280, 1440, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      const slack = await sizeCell.evaluate((el) => {
        const range = document.createRange();
        range.selectNodeContents(el);
        const contentWidth = range.getBoundingClientRect().width;
        const cs = getComputedStyle(el);
        const box =
          el.clientWidth -
          parseFloat(cs.paddingLeft) -
          parseFloat(cs.paddingRight);
        return box - contentWidth;
      });
      expect(
        slack,
        `SIZE cell content clipped at ${width}px`,
      ).toBeGreaterThanOrEqual(3);
    }
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
    await page.getByRole("button", { name: /Newest first.*oldest/i }).click();

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
    // Table view is the default — dashes are visible in status/elapsed columns.
    await injectExchanges(page, [makeGetRequest(1, "/api/pending")]);

    // Status should show "—" and elapsed should show "—"
    const dashes = page.getByText("—");
    await expect(dashes.first()).toBeVisible();
  });

  test("11.2 5xx errors show the server-status color", async ({ page }) => {
    await injectExchanges(page, [
      makeGetRequest(1, "/api/fail"),
      makeResponse(1, "500 Internal Server Error"),
    ]);

    // Table view (default) shows just the numeric code; look for "500"
    // within a table row's status cell. v2.3 colours 5xx via text-server.
    const status = page
      .locator("button[role='option'] span", { hasText: /^500$/ })
      .first();
    await expect(status).toBeVisible();
    await expect(status).toHaveClass(/text-server/);
  });

  test("11.3 compact rows mode sizes wrapper to fit content without clipping", async ({
    page,
  }) => {
    // This is a rows-mode test; switch from default table mode.
    await page.getByLabel("Rows view").click();
    await injectExchanges(page, [
      makeGetRequest(1, "/api/test"),
      makeResponse(1, "200 OK"),
    ]);

    // Toggle to compact
    await page.keyboard.press("Meta+k");
    await page.getByText("Compact density").click();

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
    await page.getByLabel("Rows view").click();
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

    const boxes = await rows.evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom };
      }),
    );

    // Adjacent row buttons should not overlap: row[i].bottom should be at or
    // before row[i+1].top.
    for (let i = 0; i < boxes.length - 1; i++) {
      expect(boxes[i].bottom).toBeLessThanOrEqual(boxes[i + 1].top + 1); // +1 px for sub-pixel rounding
    }
  });
});
