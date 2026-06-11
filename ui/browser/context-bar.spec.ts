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

// The context bar lives at the top of the v2.3 inspector (PRO-360). It holds the
// Prev/Next nav, method badge, path, status code, elapsed pill, and trace pill.

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

// Locate the context bar as the grandparent of the "Previous request" button
// (button → nav wrapper → context bar).
function contextBar(page: import("@playwright/test").Page) {
  return page
    .getByRole("button", { name: "Previous request" })
    .locator("../..");
}

// ---------------------------------------------------------------------------
// 1. Method + status + path display
// ---------------------------------------------------------------------------

test.describe("ContextBar — method, status, and path display", () => {
  test("1.1 shows method badge, status code, and path for selected exchange", async ({
    page,
  }) => {
    await injectExchanges(page, [
      ...makeCompleteExchange(1, "GET", "/api/movies", "200 OK"),
    ]);

    await page.getByText("/api/movies").first().click();

    const bar = contextBar(page);
    await expect(bar.getByText("GET")).toBeVisible();
    // Context bar shows the numeric code only (table-style StatusCode).
    await expect(bar.getByTestId("status-code")).toHaveText("200");
    await expect(bar.getByText("/api/movies")).toBeVisible();
  });

  test("1.2 pending exchange shows the pending status treatment", async ({
    page,
  }) => {
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

    // Pending: the status code renders without the error treatment.
    const status = contextBar(page).getByTestId("status-code");
    await expect(status).toBeVisible();
    await expect(status).not.toHaveAttribute("data-error");
  });

  test("1.3 error exchange shows the Error status treatment", async ({
    page,
  }) => {
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
        event: { type: "Error", message: "connection refused" },
      },
    ]);

    await page.getByText("/api/error").first().click();

    const status = contextBar(page).getByTestId("status-code");
    await expect(status).toBeVisible();
    await expect(status).toHaveAttribute("data-error");
    await expect(status).toHaveText("Error");
  });
});

// ---------------------------------------------------------------------------
// 2. Prev/Next navigation
// ---------------------------------------------------------------------------

test.describe("ContextBar — prev/next navigation", () => {
  const three = [
    ...makeCompleteExchange(1, "GET", "/first", "200 OK", {
      ts: "2024-01-01T00:00:01Z",
    }),
    ...makeCompleteExchange(2, "GET", "/second", "200 OK", {
      ts: "2024-01-01T00:00:02Z",
    }),
    ...makeCompleteExchange(3, "GET", "/third", "200 OK", {
      ts: "2024-01-01T00:00:03Z",
    }),
  ];

  test("2.1 clicking Next moves to the older exchange", async ({ page }) => {
    await injectExchanges(page, three);
    await page.getByText("/second").first().click();
    await page
      .getByRole("button", { name: "Next request", exact: true })
      .click();
    await expect(contextBar(page).getByText("/first")).toBeVisible();
  });

  test("2.2 clicking Prev moves to the newer exchange", async ({ page }) => {
    await injectExchanges(page, three);
    await page.getByText("/second").first().click();
    await page.getByRole("button", { name: "Previous request" }).click();
    await expect(contextBar(page).getByText("/third")).toBeVisible();
  });

  test("2.3 Prev is disabled on the first (newest) exchange", async ({
    page,
  }) => {
    await injectExchanges(page, three);
    await page.getByText("/third").first().click();
    await expect(
      page.getByRole("button", { name: "Previous request" }),
    ).toBeDisabled();
  });

  test("2.4 Next is disabled on the last (oldest) exchange", async ({
    page,
  }) => {
    await injectExchanges(page, three);
    await page.getByText("/first").first().click();
    await expect(
      page.getByRole("button", { name: "Next request", exact: true }),
    ).toBeDisabled();
  });
});

// ---------------------------------------------------------------------------
// 3. Trace pill
// ---------------------------------------------------------------------------

test.describe("ContextBar — trace pill", () => {
  const traceId = "abcdef1234567890abcdef1234567890";

  test("3.1 trace pill shows the shortened trace ID", async ({ page }) => {
    await injectExchanges(page, [
      makeRequestWithTrace(1, traceId, "/api/traced"),
      makeResponse(1, "200 OK"),
    ]);
    await page.getByText("/api/traced").first().click();
    // Rendered as "trace abcd…7890".
    await expect(page.getByText("abcd…7890", { exact: false })).toBeVisible();
  });

  test("3.2 clicking the trace pill sets traceFilter in the store", async ({
    page,
  }) => {
    await injectExchanges(page, [
      makeRequestWithTrace(1, traceId, "/api/traced"),
      makeResponse(1, "200 OK"),
    ]);
    await page.getByText("/api/traced").first().click();
    await page.getByLabel("Filter by trace").click();
    expect(await getStoreState(page, "traceFilter")).toBe(traceId);
  });
});

// ---------------------------------------------------------------------------
// 4. Query params
// ---------------------------------------------------------------------------

test.describe("ContextBar — query parameters", () => {
  test("4.1 shows parsed query params for a URI with a query string", async ({
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

    await page.getByText("/api/search").first().click();

    const bar = contextBar(page);
    await expect(bar.getByText("/api/search")).toBeVisible();
    await expect(bar.getByText("q", { exact: true })).toBeVisible();
    await expect(bar.getByText("limit", { exact: true })).toBeVisible();
    await expect(bar.getByText("test", { exact: true })).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// 5. Elapsed pill
// ---------------------------------------------------------------------------

test.describe("ContextBar — elapsed pill", () => {
  test("5.1 shows the elapsed time pill for a completed exchange", async ({
    page,
  }) => {
    await injectExchanges(page, [
      ...makeCompleteExchange(1, "GET", "/api/timed", "200 OK", {
        elapsed: 123,
      }),
    ]);

    await page.getByText("/api/timed").first().click();
    // fmtMs renders a space before the unit ("123 ms").
    await expect(contextBar(page).getByText("123 ms")).toBeVisible();
  });
});
