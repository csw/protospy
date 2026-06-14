import { test, expect } from "@playwright/test";
import { injectExchanges, resetStore, waitForStore } from "./helpers/inject";
import {
  makeResponse,
  makeCompleteExchange,
  makeRequestWithTrace,
} from "./fixtures/exchanges";

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

// ---------------------------------------------------------------------------
// Helper: inject a standard mixed set of 5 exchanges
// ---------------------------------------------------------------------------

async function injectMixedExchanges(
  page: Parameters<typeof injectExchanges>[0],
) {
  await injectExchanges(page, [
    ...makeCompleteExchange(1, "GET", "/api/movies", "200 OK", {
      ts: "2024-01-01T00:00:01Z",
    }),
    ...makeCompleteExchange(2, "POST", "/api/movies", "201 Created", {
      ts: "2024-01-01T00:00:02Z",
    }),
    ...makeCompleteExchange(3, "DELETE", "/api/resource/99", "204 No Content", {
      ts: "2024-01-01T00:00:03Z",
    }),
    ...makeCompleteExchange(4, "GET", "/api/users", "404 Not Found", {
      ts: "2024-01-01T00:00:04Z",
    }),
    ...makeCompleteExchange(5, "GET", "/api/health", "200 OK", {
      ts: "2024-01-01T00:00:05Z",
    }),
  ]);
}

// ---------------------------------------------------------------------------
// Filter bar tests
// ---------------------------------------------------------------------------

test.describe("Filter bar", () => {
  test("1. filter by method: POST shows only POST exchanges", async ({
    page,
  }) => {
    await injectMixedExchanges(page);

    const input = page.getByLabel("Filter requests");
    await input.fill("POST");

    const rows = page.locator("button[aria-selected]");
    await expect(rows).toHaveCount(1);
    await expect(page.getByText("POST").first()).toBeVisible();
    // GET and DELETE rows should be gone
    await expect(page.getByText("/api/movies").first()).toBeVisible();
    await expect(page.getByText("/api/users")).not.toBeVisible();
    await expect(page.getByText("/api/health")).not.toBeVisible();
  });

  test("2. filter by path: /api/movies narrows to matching paths", async ({
    page,
  }) => {
    await injectMixedExchanges(page);

    const input = page.getByLabel("Filter requests");
    await input.fill("/api/movies");

    const rows = page.locator("button[aria-selected]");
    // Two exchanges have /api/movies (GET and POST)
    await expect(rows).toHaveCount(2);
    await expect(page.getByText("/api/movies").first()).toBeVisible();
    await expect(page.getByText("/api/users")).not.toBeVisible();
    await expect(page.getByText("/api/health")).not.toBeVisible();
  });

  test("3. filter by status: 404 shows only 404 responses", async ({
    page,
  }) => {
    // Switch to table mode (rows is the default); this test asserts on the
    // numeric-code-only status cell.
    await page.getByLabel("Table view").click();
    await injectMixedExchanges(page);

    const input = page.getByLabel("Filter requests");
    await input.fill("404");

    const rows = page.locator("button[aria-selected]");
    await expect(rows).toHaveCount(1);
    // Table view shows numeric code only; verify the 404 row is visible and no
    // 200/201 rows remain.
    await expect(
      page.locator("button[role='option'] span", { hasText: /^404$/ }).first(),
    ).toBeVisible();
    await expect(
      page.locator("button[role='option'] span", { hasText: /^200$/ }),
    ).not.toBeVisible();
    await expect(
      page.locator("button[role='option'] span", { hasText: /^201$/ }),
    ).not.toBeVisible();
  });

  test("4. case insensitive: 'get' matches GET exchanges", async ({ page }) => {
    await injectMixedExchanges(page);

    const input = page.getByLabel("Filter requests");
    await input.fill("get");

    const rows = page.locator("button[aria-selected]");
    // Three GET exchanges: /api/movies, /api/users, /api/health
    await expect(rows).toHaveCount(3);
    await expect(page.getByText("GET").first()).toBeVisible();
    await expect(page.getByText("POST")).not.toBeVisible();
    await expect(page.getByText("DELETE")).not.toBeVisible();
  });

  test("5. no matches: 'nonexistent' shows empty state", async ({ page }) => {
    await injectMixedExchanges(page);

    const input = page.getByLabel("Filter requests");
    await input.fill("nonexistent");

    await expect(page.getByText("No requests match your filter")).toBeVisible();
    const rows = page.locator("button[aria-selected]");
    await expect(rows).toHaveCount(0);
  });

  test("6. clear filter: emptying the input restores full list", async ({
    page,
  }) => {
    await injectMixedExchanges(page);

    const input = page.getByLabel("Filter requests");
    await input.fill("POST");

    // Verify filter is active
    await expect(page.locator("button[aria-selected]")).toHaveCount(1);

    // Clear the filter
    await input.fill("");

    // All 5 exchanges should be visible again
    await expect(page.locator("button[aria-selected]")).toHaveCount(5);
    // Input should be empty
    await expect(input).toHaveValue("");
  });

  test("7. filter count display: shows 'X of Y' when filtering, 'N requests' when not", async ({
    page,
  }) => {
    await injectMixedExchanges(page);

    // Before filtering: shows total count (appears in FilterBar and StatusBar, use first)
    await expect(
      page.getByText("5 requests", { exact: true }).first(),
    ).toBeVisible();

    // After filtering to 2 matches
    const input = page.getByLabel("Filter requests");
    await input.fill("/api/movies");

    await expect(page.getByText("2 of 5", { exact: true })).toBeVisible();
  });

  test("9. method filter AND trace filter narrow to the intersection", async ({
    page,
  }) => {
    const traceA = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const traceB = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

    // Inject 4 exchanges: two on trace A (GET + POST), two on trace B
    // (GET + POST). Each gets a paired response so the row is well-formed.
    await injectExchanges(page, [
      makeRequestWithTrace(1, traceA, "/api/a-get"),
      makeResponse(1, "200 OK"),
      {
        exchange: { exchange_id: 2, timestamp: "2024-01-01T00:00:02Z" },
        direction: "Request",
        event: {
          type: "Request",
          method: "POST",
          uri: "/api/a-post",
          version: "HTTP/1.1",
          headers: [
            { name: "Content-Type", value: "application/json" },
            {
              name: "traceparent",
              value: `00-${traceA}-0000000000000001-01`,
            },
          ],
          body: { type: "NoBody" },
        },
      },
      makeResponse(2, "201 Created"),
      makeRequestWithTrace(3, traceB, "/api/b-get"),
      makeResponse(3, "200 OK"),
      {
        exchange: { exchange_id: 4, timestamp: "2024-01-01T00:00:04Z" },
        direction: "Request",
        event: {
          type: "Request",
          method: "POST",
          uri: "/api/b-post",
          version: "HTTP/1.1",
          headers: [
            { name: "Content-Type", value: "application/json" },
            {
              name: "traceparent",
              value: `00-${traceB}-0000000000000001-01`,
            },
          ],
          body: { type: "NoBody" },
        },
      },
      makeResponse(4, "201 Created"),
    ]);

    // Baseline: all 4 visible
    await expect(page.locator("button[aria-selected]")).toHaveCount(4);

    // Apply the method filter alone → 2 POST rows
    const input = page.getByLabel("Filter requests");
    await input.fill("POST");
    await expect(page.locator("button[aria-selected]")).toHaveCount(2);

    // Now set the trace filter to trace A → intersection is just /api/a-post
    await page.evaluate((tid) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const store = (window as any).__test_store;
      store.getState().setTraceFilter(tid);
    }, traceA);

    await expect(page.locator("button[aria-selected]")).toHaveCount(1);
    await expect(page.getByText("/api/a-post").first()).toBeVisible();
    await expect(page.getByText("/api/b-post")).not.toBeVisible();

    // Clear the trace filter via the active trace chip → method filter still
    // active → 2 POST rows again.
    await page.getByRole("button", { name: /trace aaaa/i }).click();
    await expect(page.locator("button[aria-selected]")).toHaveCount(2);
    await expect(page.getByText("/api/a-post").first()).toBeVisible();
    await expect(page.getByText("/api/b-post").first()).toBeVisible();

    // Sanity: a GET row still excluded by the method filter
    await expect(page.getByText("/api/a-get")).not.toBeVisible();
  });

  test("8. trace filter chip shows when traceFilter is set", async ({
    page,
  }) => {
    const traceId = "abcdef1234567890abcdef1234567890";
    await injectExchanges(page, [
      makeRequestWithTrace(1, traceId, "/api/traced"),
      makeResponse(1, "200 OK"),
    ]);

    // Set the trace filter via store
    await page.evaluate((tid) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const store = (window as any).__test_store;
      store.getState().setTraceFilter(tid);
    }, traceId);

    // Trace chip should appear with abbreviated trace ID
    await expect(page.getByText(/trace abcd…7890/)).toBeVisible();

    // Clear trace filter via the active trace chip.
    const clearTrace = page.getByRole("button", { name: /trace abcd/i });
    await expect(clearTrace).toBeVisible();
    await clearTrace.click();

    // Chip should disappear
    await expect(page.getByText(/trace abcd…7890/)).not.toBeVisible();
  });
});
