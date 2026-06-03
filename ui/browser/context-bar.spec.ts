import { test, expect } from "@playwright/test";
import {
  injectExchanges,
  resetStore,
  waitForStore,
  getStoreState,
} from "./helpers/inject";
import {
  makeCompleteExchange,
  makeRequestWithTrace,
  makeResponse,
} from "./fixtures/exchanges";

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

// The context bar is the container that holds the Prev/Next navigation buttons.
// We locate it as the parent div of the "Previous exchange" button.
// Using xpath ".." to get the grandparent (the full bar) from the nav wrapper.
function contextBar(page: import("@playwright/test").Page) {
  // The Prev button sits inside: contextBar > div.flex > button[aria-label]
  // So we go up two levels from the button.
  return page
    .getByRole("button", { name: "Previous exchange" })
    .locator("../..");
}

// ---------------------------------------------------------------------------
// 1. Method + status + path display
// ---------------------------------------------------------------------------

test.describe("ContextBar — method, status, and path display", () => {
  test("1.1 shows method badge, status, and path for selected exchange", async ({
    page,
  }) => {
    await injectExchanges(page, [
      ...makeCompleteExchange(1, "GET", "/api/movies", "200 OK"),
    ]);

    // Select the exchange by clicking the URI text in the list
    await page.getByText("/api/movies").first().click();

    // Context bar should display the method badge, status, and path
    const bar = contextBar(page);
    await expect(bar.getByText("GET")).toBeVisible();
    await expect(bar.getByText("200 OK")).toBeVisible();
    await expect(bar.getByText("/api/movies")).toBeVisible();
  });

  test("1.2 pending exchange shows pulsing amber dot and 'pending' text", async ({
    page,
  }) => {
    // Inject only a request, no response
    await injectExchanges(page, [
      {
        exchange: { exchange_id: 1, timestamp: "2024-01-01T00:00:00Z" },
        direction: "Request",
        event: {
          type: "Request",
          method: "GET",
          uri: "/api/pending",
          version: "HTTP/1.1",
          headers: [],
          body: { type: "NoBody" },
        },
      },
    ]);

    await page.getByText("/api/pending").first().click();

    // Pending state shows "pending" text (no status, no error)
    await expect(
      contextBar(page).getByText("pending", { exact: true }),
    ).toBeVisible();
  });

  test("1.3 error exchange shows Error with message", async ({ page }) => {
    // Inject a request, then inject an error event
    await injectExchanges(page, [
      {
        exchange: { exchange_id: 1, timestamp: "2024-01-01T00:00:00Z" },
        direction: "Request",
        event: {
          type: "Request",
          method: "GET",
          uri: "/api/error",
          version: "HTTP/1.1",
          headers: [],
          body: { type: "NoBody" },
        },
      },
      {
        exchange: { exchange_id: 1, timestamp: "2024-01-01T00:00:01Z" },
        direction: "Request",
        event: {
          type: "Error",
          message: "connection refused",
        },
      },
    ]);

    await page.getByText("/api/error").first().click();

    // Error state shows "Error" label with the error message
    const indicator = contextBar(page).getByTestId("error-indicator");
    await expect(indicator).toBeVisible();
    await expect(indicator).toContainText("Error");
    await expect(indicator).toContainText("connection refused");
  });
});

// ---------------------------------------------------------------------------
// 2. Prev/Next navigation
// ---------------------------------------------------------------------------

test.describe("ContextBar — prev/next navigation", () => {
  test("2.1 clicking Next moves to older exchange", async ({ page }) => {
    // Inject 3 exchanges with distinct timestamps so order is deterministic.
    // Default sort is newest-first: exchange 3, 2, 1 (top to bottom).
    await injectExchanges(page, [
      ...makeCompleteExchange(1, "GET", "/first", "200 OK", {
        ts: "2024-01-01T00:00:01Z",
      }),
      ...makeCompleteExchange(2, "GET", "/second", "200 OK", {
        ts: "2024-01-01T00:00:02Z",
      }),
      ...makeCompleteExchange(3, "GET", "/third", "200 OK", {
        ts: "2024-01-01T00:00:03Z",
      }),
    ]);

    // Select the middle exchange (exchange 2) by clicking its URI
    await page.getByText("/second").first().click();

    // Click Next (goes toward older, i.e. /first)
    await page.getByRole("button", { name: "Next exchange" }).click();

    // After clicking Next, /first should now be selected and shown in context bar
    await expect(contextBar(page).getByText("/first")).toBeVisible();
  });

  test("2.2 clicking Prev moves to newer exchange", async ({ page }) => {
    await injectExchanges(page, [
      ...makeCompleteExchange(1, "GET", "/first", "200 OK", {
        ts: "2024-01-01T00:00:01Z",
      }),
      ...makeCompleteExchange(2, "GET", "/second", "200 OK", {
        ts: "2024-01-01T00:00:02Z",
      }),
      ...makeCompleteExchange(3, "GET", "/third", "200 OK", {
        ts: "2024-01-01T00:00:03Z",
      }),
    ]);

    // Select the middle exchange (exchange 2)
    await page.getByText("/second").first().click();

    // Click Prev (goes toward newer, i.e. /third)
    await page.getByRole("button", { name: "Previous exchange" }).click();

    // After clicking Prev, /third should now be shown in context bar
    await expect(contextBar(page).getByText("/third")).toBeVisible();
  });

  test("2.3 Prev button is disabled when on the first (newest) exchange", async ({
    page,
  }) => {
    await injectExchanges(page, [
      ...makeCompleteExchange(1, "GET", "/first", "200 OK", {
        ts: "2024-01-01T00:00:01Z",
      }),
      ...makeCompleteExchange(2, "GET", "/second", "200 OK", {
        ts: "2024-01-01T00:00:02Z",
      }),
      ...makeCompleteExchange(3, "GET", "/third", "200 OK", {
        ts: "2024-01-01T00:00:03Z",
      }),
    ]);

    // Select the newest exchange (exchange 3, which is first in newest-first order)
    await page.getByText("/third").first().click();

    // Previous button should be disabled (no newer exchange before index 0)
    await expect(
      page.getByRole("button", { name: "Previous exchange" }),
    ).toBeDisabled();
  });

  test("2.4 Next button is disabled when on the last (oldest) exchange", async ({
    page,
  }) => {
    await injectExchanges(page, [
      ...makeCompleteExchange(1, "GET", "/first", "200 OK", {
        ts: "2024-01-01T00:00:01Z",
      }),
      ...makeCompleteExchange(2, "GET", "/second", "200 OK", {
        ts: "2024-01-01T00:00:02Z",
      }),
      ...makeCompleteExchange(3, "GET", "/third", "200 OK", {
        ts: "2024-01-01T00:00:03Z",
      }),
    ]);

    // Select the oldest exchange (exchange 1, which is last in newest-first order)
    await page.getByText("/first").first().click();

    // Next button should be disabled (no older exchange after the last index)
    await expect(
      page.getByRole("button", { name: "Next exchange" }),
    ).toBeDisabled();
  });
});

// ---------------------------------------------------------------------------
// 3. Trace pill
// ---------------------------------------------------------------------------

test.describe("ContextBar — trace pill", () => {
  test("3.1 trace pill shows shortened trace ID", async ({ page }) => {
    const traceId = "abcdef1234567890abcdef1234567890";
    await injectExchanges(page, [
      makeRequestWithTrace(1, traceId, "/api/traced"),
      makeResponse(1, "200 OK"),
    ]);

    await page.getByText("/api/traced").first().click();

    // Trace pill should display "abcd…7890" (first 4 + ellipsis + last 4)
    await expect(page.getByText("abcd…7890")).toBeVisible();
  });

  test("3.2 clicking trace pill sets traceFilter in store", async ({
    page,
  }) => {
    const traceId = "abcdef1234567890abcdef1234567890";
    await injectExchanges(page, [
      makeRequestWithTrace(1, traceId, "/api/traced"),
      makeResponse(1, "200 OK"),
    ]);

    await page.getByText("/api/traced").first().click();

    // The trace pill's swatch + trace ID button has aria-label="Filter by trace".
    await page.getByLabel("Filter by trace").click();

    const traceFilter = await getStoreState(page, "traceFilter");
    expect(traceFilter).toBe(traceId);
  });
});

// ---------------------------------------------------------------------------
// 4. Query params
// ---------------------------------------------------------------------------

test.describe("ContextBar — query parameters", () => {
  test("4.1 shows parsed query params for URI with query string", async ({
    page,
  }) => {
    await injectExchanges(page, [
      ...makeCompleteExchange(
        1,
        "GET",
        "/api/search?q=test&limit=10",
        "200 OK",
      ),
    ]);

    // The list item shows the path part; click it to select
    await page.getByText("/api/search").first().click();

    // Context bar shows path and parsed query params.
    // ContextBar renders: pathOnly | "?" | key=value pairs separately.
    const bar = contextBar(page);

    // Path portion
    await expect(bar.getByText("/api/search")).toBeVisible();

    // Query param keys (rendered with text-accent-ink class)
    await expect(bar.getByText("q")).toBeVisible();
    await expect(bar.getByText("limit")).toBeVisible();

    // Query param values (rendered with text-ink-2 class)
    await expect(bar.getByText("test")).toBeVisible();
    await expect(bar.getByText("10")).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// 5. Elapsed pill
// ---------------------------------------------------------------------------

test.describe("ContextBar — elapsed pill", () => {
  test("5.1 shows elapsed time pill for completed exchange", async ({
    page,
  }) => {
    await injectExchanges(page, [
      ...makeCompleteExchange(1, "GET", "/api/timed", "200 OK", {
        elapsed: 123,
      }),
    ]);

    await page.getByText("/api/timed").first().click();

    // Elapsed pill should show "123ms" in the context bar
    await expect(contextBar(page).getByText("123ms")).toBeVisible();
  });
});
