import { test, expect } from "@playwright/test";
import { injectExchanges, resetStore, waitForStore } from "./helpers/inject";
import {
  makeGetRequest,
  makeResponse,
  makeCompleteExchange,
  makeSSEResponse,
  makeMsearchRequest,
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

// ---------------------------------------------------------------------------
// 1. Empty state
// ---------------------------------------------------------------------------

test.describe("Inspector — empty state", () => {
  test("1.1 shows 'Select an exchange' when no exchange is selected", async ({
    page,
  }) => {
    await expect(page.getByText("Select an exchange")).toBeVisible();
  });

  test("1.2 empty state clears when an exchange is selected", async ({
    page,
  }) => {
    await injectExchanges(page, [
      makeGetRequest(1, "/api/test"),
      makeResponse(1, "200 OK"),
    ]);

    await expect(page.getByText("Select an exchange")).toBeVisible();
    await page.getByText("/api/test").first().click();
    await expect(page.getByText("Select an exchange")).not.toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// 2. Bodies tab (default)
// ---------------------------------------------------------------------------

test.describe("Inspector — Bodies tab", () => {
  test("2.1 Bodies tab is active by default when an exchange is selected", async ({
    page,
  }) => {
    await injectExchanges(page, [
      makeGetRequest(1, "/api/default-tab"),
      makeResponse(1, "200 OK", '{"ok":true}'),
    ]);

    await page.getByText("/api/default-tab").first().click();

    await expect(page.getByRole("tab", { name: "Bodies" })).toHaveAttribute(
      "data-state",
      "active",
    );
  });

  test("2.2 Bodies tab content is visible when active", async ({ page }) => {
    await injectExchanges(page, [
      makeGetRequest(1, "/api/bodies"),
      makeResponse(1, "200 OK", '{"result":"yes"}'),
    ]);

    await page.getByText("/api/bodies").first().click();

    // BodySplit renders "Request" and "Response" pane headers
    await expect(page.getByText("Request")).toBeVisible();
    await expect(page.getByText("Response")).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// 3. Request headers tab
// ---------------------------------------------------------------------------

test.describe("Inspector — Req headers tab", () => {
  test("3.1 Req headers tab shows count and header table", async ({ page }) => {
    await injectExchanges(page, [
      makeGetRequest(1, "/api/req-hdrs"),
      makeResponse(1, "200 OK"),
    ]);

    await page.getByText("/api/req-hdrs").first().click();

    // makeGetRequest injects JSON_CT (1 header)
    const tab = page.getByRole("tab", { name: "Req headers (1)" });
    await expect(tab).toBeVisible();
    await tab.click();
    await expect(tab).toHaveAttribute("data-state", "active");

    // Header table should show the Content-Type header
    await expect(page.getByText("Content-Type")).toBeVisible();
    await expect(page.getByText("application/json")).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// 4. Response headers tab
// ---------------------------------------------------------------------------

test.describe("Inspector — Res headers tab", () => {
  test("4.1 Res headers tab shows count and header table", async ({ page }) => {
    await injectExchanges(page, [
      makeGetRequest(1, "/api/res-hdrs"),
      makeResponse(1, "200 OK"),
    ]);

    await page.getByText("/api/res-hdrs").first().click();

    // makeResponse defaults to JSON_CT (1 header)
    const tab = page.getByRole("tab", { name: "Res headers (1)" });
    await expect(tab).toBeVisible();
    await tab.click();
    await expect(tab).toHaveAttribute("data-state", "active");

    // Header table should show the Content-Type header
    await expect(page.getByText("Content-Type")).toBeVisible();
    await expect(page.getByText("application/json")).toBeVisible();
  });

  test("4.2 Res headers tab with custom headers shows all headers", async ({
    page,
  }) => {
    await injectExchanges(page, [
      makeGetRequest(1, "/api/custom-hdrs"),
      makeResponse(1, "200 OK", undefined, undefined, [
        { name: "Content-Type", value: "application/json" },
        { name: "X-Request-Id", value: "abc-123" },
      ]),
    ]);

    await page.getByText("/api/custom-hdrs").first().click();

    const tab = page.getByRole("tab", { name: "Res headers (2)" });
    await expect(tab).toBeVisible();
    await tab.click();

    await expect(page.getByText("X-Request-Id")).toBeVisible();
    await expect(page.getByText("abc-123")).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// 5. Timing tab
// ---------------------------------------------------------------------------

test.describe("Inspector — Timing tab", () => {
  test("5.1 Timing tab renders fact table and waterfall", async ({ page }) => {
    await injectExchanges(page, [
      ...makeCompleteExchange(1, "GET", "/api/timing", "200 OK", {
        elapsed: 55,
      }),
    ]);

    await page.getByText("/api/timing").first().click();

    const tab = page.getByRole("tab", { name: "Timing" });
    await expect(tab).toBeVisible();
    await tab.click();
    await expect(tab).toHaveAttribute("data-state", "active");

    // Fact table rows unique to TimingView
    await expect(page.getByText("Request started")).toBeVisible();
    await expect(page.getByText("Waterfall")).toBeVisible();

    // Elapsed appears in the timing fact table
    const timingPanel = page
      .locator('[role="tabpanel"]')
      .filter({ hasText: "Request started" });
    await expect(timingPanel.getByText("55ms").first()).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// 6. Stream tab label
// ---------------------------------------------------------------------------

test.describe("Inspector — Stream tab", () => {
  test("6.1 Bodies tab label changes to 'Stream' for SSE responses", async ({
    page,
  }) => {
    await injectExchanges(page, [
      makeGetRequest(1, "/api/events"),
      makeSSEResponse(1, "data: hello\n\n"),
    ]);

    await page.getByText("/api/events").first().click();

    // Tab label should be "Stream" not "Bodies"
    await expect(page.getByRole("tab", { name: "Stream" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Bodies" })).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------
// 7. Pairs tab
// ---------------------------------------------------------------------------

test.describe("Inspector — Pairs tab", () => {
  test("7.1 Pairs tab appears for _msearch requests", async ({ page }) => {
    await injectExchanges(page, [
      makeMsearchRequest(1),
      makeResponse(1, "200 OK", '{"responses":[]}'),
    ]);

    await page.getByText("/_msearch").first().click();

    await expect(page.getByRole("tab", { name: "Pairs" })).toBeVisible();
  });

  test("7.2 Pairs tab is not shown for regular requests", async ({ page }) => {
    await injectExchanges(page, [
      makeGetRequest(1, "/api/regular"),
      makeResponse(1, "200 OK"),
    ]);

    await page.getByText("/api/regular").first().click();

    await expect(page.getByRole("tab", { name: "Pairs" })).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------
// 8. NoBody empty state
// ---------------------------------------------------------------------------

test.describe("Inspector — NoBody empty state", () => {
  test("8.1 Bodies tab shows 'No body' for request and response with no body", async ({
    page,
  }) => {
    // makeGetRequest uses NoBody; makeResponse with no body arg also uses NoBody
    await injectExchanges(page, [
      makeGetRequest(1, "/api/nobody"),
      makeResponse(1, "204 No Content"),
    ]);

    await page.getByText("/api/nobody").first().click();

    // Both panes show "No body"; assert at least one is present
    await expect(page.getByText("No body").first()).toBeVisible();
  });
});
