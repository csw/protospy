import { test, expect, type Page } from "@playwright/test";
import {
  injectExchanges,
  resetStore,
  setStoreProtocol,
  waitForStore,
} from "./helpers/inject";
import {
  makeGetRequest,
  makePostRequest,
  makeResponse,
  makeCompleteExchange,
  makeSSEResponse,
  makeMsearchRequest,
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
// 1. Empty state
// ---------------------------------------------------------------------------

test.describe("Inspector — empty state", () => {
  test("1.1 shows 'Select a request to inspect' when no exchange is selected", async ({
    page,
  }) => {
    await expect(page.getByText("Select a request to inspect")).toBeVisible();
  });

  test("1.2 empty state clears when an exchange is selected", async ({
    page,
  }) => {
    await injectExchanges(page, [
      makeGetRequest(1, "/api/test"),
      makeResponse(1, "200 OK"),
    ]);

    await expect(page.getByText("Select a request to inspect")).toBeVisible();
    await page.getByText("/api/test").first().click();
    await expect(
      page.getByText("Select a request to inspect"),
    ).not.toBeVisible();
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
    await expect(page.getByText("Request", { exact: true })).toBeVisible();
    await expect(page.getByText("Response", { exact: true })).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// 3. Unified Headers tab
// ---------------------------------------------------------------------------

test.describe("Inspector — Headers tab", () => {
  test("3.1 single Headers tab replaces separate request/response header tabs", async ({
    page,
  }) => {
    await injectExchanges(page, [
      makeGetRequest(1, "/api/hdrs"),
      makeResponse(1, "200 OK"),
    ]);

    await page.getByText("/api/hdrs").first().click();

    // Single "Headers" tab exists
    await expect(page.getByRole("tab", { name: "Headers" })).toBeVisible();

    // Old separate tabs must not exist
    await expect(
      page.getByRole("tab", { name: /Request headers/ }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("tab", { name: /Response headers/ }),
    ).toHaveCount(0);
  });

  test("3.2 Headers tab shows request and response panels side-by-side", async ({
    page,
  }) => {
    await injectExchanges(page, [
      makeGetRequest(1, "/api/hdrs"),
      makeResponse(1, "200 OK"),
    ]);

    await page.getByText("/api/hdrs").first().click();
    await page.getByRole("tab", { name: "Headers" }).click();

    // Both panel titles visible
    const reqPanel = page.locator('[data-testid="headers-panel-request"]');
    const resPanel = page.locator('[data-testid="headers-panel-response"]');
    await expect(reqPanel.getByText("Request", { exact: true })).toBeVisible();
    await expect(resPanel.getByText("Response", { exact: true })).toBeVisible();
  });

  test("3.3 request panel shows request headers; response panel shows response headers", async ({
    page,
  }) => {
    await injectExchanges(page, [
      makeGetRequest(1, "/api/hdrs", undefined, [
        { name: "x-req-only", value: "req-value" },
      ]),
      makeResponse(1, "200 OK", undefined, undefined, [
        { name: "x-res-only", value: "res-value" },
      ]),
    ]);

    await page.getByText("/api/hdrs").first().click();
    await page.getByRole("tab", { name: "Headers" }).click();

    const reqPanel = page.locator('[data-testid="headers-panel-request"]');
    const resPanel = page.locator('[data-testid="headers-panel-response"]');

    await expect(reqPanel.getByText("x-req-only")).toBeVisible();
    await expect(reqPanel.getByText("req-value")).toBeVisible();
    await expect(resPanel.getByText("x-res-only")).toBeVisible();
    await expect(resPanel.getByText("res-value")).toBeVisible();

    // Cross-check: response header absent from request panel DOM and vice versa.
    // Use toHaveCount(0) rather than not.toBeVisible() — an absent locator is
    // trivially "not visible", so not.toBeVisible() would pass even if the element
    // were rendered but hidden. toHaveCount(0) actually verifies DOM absence.
    await expect(reqPanel.getByText("x-res-only")).toHaveCount(0);
    await expect(resPanel.getByText("x-req-only")).toHaveCount(0);
  });

  test("3.4 panel headers show header counts", async ({ page }) => {
    await injectExchanges(page, [
      makeGetRequest(1, "/api/hdrs", undefined, [
        { name: "content-type", value: "application/json" },
        { name: "x-extra", value: "1" },
      ]),
      makeResponse(1, "200 OK", undefined, undefined, [
        { name: "content-type", value: "text/plain" },
      ]),
    ]);

    await page.getByText("/api/hdrs").first().click();
    await page.getByRole("tab", { name: "Headers" }).click();

    const reqPanel = page.locator('[data-testid="headers-panel-request"]');
    const resPanel = page.locator('[data-testid="headers-panel-response"]');

    await expect(reqPanel.getByText("2 headers")).toBeVisible();
    await expect(resPanel.getByText("1 header")).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// 4. Timing tab
// ---------------------------------------------------------------------------

test.describe("Inspector — Timing tab", () => {
  test("4.1 Timing tab renders honest facts and no synthetic waterfall", async ({
    page,
  }) => {
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

    // v2.3 fact rows (bytes terminology); the synthetic waterfall is gone
    // (design-system hard rule 14).
    await expect(page.getByText("Started")).toBeVisible();
    await expect(page.getByText("HTTP version")).toBeVisible();
    await expect(page.getByText("Request bytes")).toBeVisible();
    await expect(page.getByText("Waterfall")).toHaveCount(0);

    // Elapsed appears in the timing fact table ("55 ms", spaced).
    const timingPanel = page
      .locator('[role="tabpanel"]')
      .filter({ hasText: "HTTP version" });
    await expect(timingPanel.getByText("55 ms").first()).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// 5. Stream tab label
// ---------------------------------------------------------------------------

test.describe("Inspector — Stream tab", () => {
  test("5.1 Bodies tab label changes to 'Stream' for SSE responses", async ({
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

  test("5.2 Stream tab renders N event rows with correct event types", async ({
    page,
  }) => {
    // Build an SSE body with 4 distinct events. StreamView is in "events"
    // mode by default and renders each event with its type badge.
    const sseBody =
      'event: message_start\ndata: {"type":"message_start","message":{"id":"msg_1"}}\n\n' +
      'event: content_block_start\ndata: {"type":"content_block_start"}\n\n' +
      'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"hi"}}\n\n' +
      'event: message_stop\ndata: {"type":"message_stop"}\n\n';

    await injectExchanges(page, [
      makeGetRequest(1, "/api/multi"),
      makeSSEResponse(1, sseBody),
    ]);

    await page.getByText("/api/multi").first().click();

    // The Stream tab head shows an event count
    await expect(page.getByText("4 events")).toBeVisible();

    // Each event type label appears in its own row
    await expect(
      page.getByText("message_start", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("content_block_start", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("content_block_delta", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("message_stop", { exact: true })).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// 6. Body view-mode selector (Parsed · Raw · Hex, plus Paired for msearch)
// ---------------------------------------------------------------------------

test.describe("Inspector — body view-mode selector", () => {
  test("6.1 msearch gains the Paired option alongside parsed/raw/hex (no Pairs tab)", async ({
    page,
  }) => {
    await setStoreProtocol(page, "Elasticsearch");
    await injectExchanges(page, [
      makeMsearchRequest(1),
      makeResponse(1, "200 OK", '{"responses":[]}'),
    ]);

    await page.getByText("/_msearch").first().click();

    // The kept deviation: msearch is an in-Bodies selector option, not a separate tab.
    await expect(page.getByRole("tab", { name: "Pairs" })).toHaveCount(0);
    await expect(page.getByText("Paired", { exact: true })).toBeVisible();
    await expect(page.getByText("Parsed", { exact: true })).toBeVisible();
    await expect(page.getByText("Hex", { exact: true })).toBeVisible();
  });

  test("6.2 regular requests get parsed/raw/hex but no Paired option", async ({
    page,
  }) => {
    await injectExchanges(page, [
      makeGetRequest(1, "/api/regular"),
      makeResponse(1, "200 OK"),
    ]);

    await page.getByText("/api/regular").first().click();

    await expect(page.getByText("Parsed", { exact: true })).toBeVisible();
    await expect(page.getByText("Raw", { exact: true })).toBeVisible();
    await expect(page.getByText("Hex", { exact: true })).toBeVisible();
    await expect(page.getByText("Paired", { exact: true })).toHaveCount(0);
  });

  test("6.3 selecting Raw / Hex swaps the rendered body view", async ({
    page,
  }) => {
    await injectExchanges(page, [
      makePostRequest(1, "/api/echo", '{"hello":"world"}'),
      makeResponse(1, "200 OK", '{"ok":true}'),
    ]);

    await page.getByText("/api/echo").first().click();

    // Parsed by default → JSON viewer present, no raw/hex viewer.
    await expect(page.getByLabel("JSON viewer").first()).toBeVisible();

    await page.getByText("Hex", { exact: true }).click();
    await expect(page.getByLabel("Hex viewer").first()).toBeVisible();

    await page.getByText("Raw", { exact: true }).click();
    await expect(page.getByLabel("Raw body viewer").first()).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// 7. NoBody empty state
// ---------------------------------------------------------------------------

test.describe("Inspector — NoBody empty state", () => {
  test("7.1 Bodies tab shows 'No body' for request and response with no body", async ({
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

// ---------------------------------------------------------------------------
// 8. Headers filter, pinning, masking, and copy
// ---------------------------------------------------------------------------

test.describe("Inspector — Headers filter and pinning", () => {
  // Navigate to the Headers tab and return a scoped locator for the request panel
  async function openHeadersTab(page: Page) {
    await page.getByText("/api/hdrs").first().click();
    await page.getByRole("tab", { name: "Headers" }).click();
  }

  function reqPanel(page: Page) {
    return page.locator('[data-testid="headers-panel-request"]');
  }

  test("8.1 filter input is visible in the request panel on the Headers tab", async ({
    page,
  }) => {
    await injectExchanges(page, [
      makeGetRequest(1, "/api/hdrs"),
      makeResponse(1, "200 OK"),
    ]);
    await openHeadersTab(page);
    await expect(
      reqPanel(page).getByPlaceholder("Filter headers…"),
    ).toBeVisible();
  });

  test("8.2 typing in request panel filter narrows headers by name substring", async ({
    page,
  }) => {
    await injectExchanges(page, [
      makeGetRequest(1, "/api/hdrs", undefined, [
        { name: "content-type", value: "application/json" },
        { name: "x-custom-header", value: "myvalue" },
      ]),
      makeResponse(1, "200 OK", undefined, undefined, []),
    ]);
    await openHeadersTab(page);

    const panel = reqPanel(page);

    // Both request headers visible initially
    await expect(panel.getByText("content-type")).toBeVisible();
    await expect(panel.getByText("x-custom-header")).toBeVisible();

    // Filter to just x-custom-header
    await panel.getByPlaceholder("Filter headers…").fill("x-custom");

    await expect(panel.getByText("x-custom-header")).toBeVisible();
    await expect(panel.getByText("content-type")).not.toBeVisible();
  });

  test("8.3 clear button restores all headers in request panel", async ({
    page,
  }) => {
    await injectExchanges(page, [
      makeGetRequest(1, "/api/hdrs", undefined, [
        { name: "content-type", value: "application/json" },
        { name: "x-custom-header", value: "myvalue" },
      ]),
      makeResponse(1, "200 OK", undefined, undefined, []),
    ]);
    await openHeadersTab(page);

    const panel = reqPanel(page);
    await panel.getByPlaceholder("Filter headers…").fill("x-custom");
    await expect(panel.getByText("content-type")).not.toBeVisible();

    await panel.getByLabel("Clear filter").click();
    await expect(panel.getByText("content-type")).toBeVisible();
    await expect(panel.getByText("x-custom-header")).toBeVisible();
  });

  test("8.4 pinned header (content-type) appears before unpinned header", async ({
    page,
  }) => {
    // Inject x-custom FIRST, then content-type — pinning should reorder
    await injectExchanges(page, [
      makeGetRequest(1, "/api/hdrs", undefined, [
        { name: "x-custom-header", value: "first" },
        { name: "content-type", value: "application/json" },
      ]),
      makeResponse(1, "200 OK", undefined, undefined, []),
    ]);
    await openHeadersTab(page);

    // Get name cells in the request panel table
    const nameCells = reqPanel(page).locator("table tbody tr td:first-child");
    const firstCell = nameCells.first();
    await expect(firstCell).toHaveText("content-type");
  });

  test("8.5 authorization header value is masked; copy button copies real value", async ({
    page,
  }) => {
    // Intercept clipboard
    await page.evaluate(() => {
      window.__clipboard = "";
      Object.defineProperty(navigator, "clipboard", {
        value: {
          writeText: (text: string) => {
            window.__clipboard = text;
            return Promise.resolve();
          },
        },
        configurable: true,
      });
    });

    await injectExchanges(page, [
      makeGetRequest(1, "/api/hdrs", undefined, [
        { name: "authorization", value: "Bearer real-secret-token" },
      ]),
      makeResponse(1, "200 OK", undefined, undefined, []),
    ]);
    await openHeadersTab(page);

    const panel = reqPanel(page);

    // Masked value is shown, real value is not
    await expect(panel.getByText("Bearer **********")).toBeVisible();
    await expect(panel.getByText("Bearer real-secret-token")).not.toBeVisible();

    // Hover the row to reveal copy button, then click
    const row = panel.locator("table tbody tr").first();
    await row.hover();
    await panel.getByLabel("Copy authorization value").click();

    const copied = await page.evaluate(() => window.__clipboard);
    expect(copied).toBe("Bearer real-secret-token");
  });

  test("8.5a copied header affordance hides immediately after leaving the row", async ({
    page,
  }) => {
    await page.evaluate(() => {
      window.__clipboard = "";
      Object.defineProperty(navigator, "clipboard", {
        value: {
          writeText: (text: string) => {
            window.__clipboard = text;
            return Promise.resolve();
          },
        },
        configurable: true,
      });
    });

    await injectExchanges(page, [
      makeGetRequest(1, "/api/hdrs", undefined, [
        { name: "content-type", value: "application/json" },
      ]),
      makeResponse(1, "200 OK", undefined, undefined, []),
    ]);
    await openHeadersTab(page);

    const panel = reqPanel(page);
    const row = panel.locator("table tbody tr").first();
    const copyButton = panel.getByLabel("Copy content-type value");

    await row.hover();
    await expect(copyButton).toBeVisible();
    await copyButton.click();
    await expect(copyButton.locator(".lucide-check")).toBeVisible();

    await page.mouse.move(0, 0);

    await expect(copyButton).toBeHidden();
    await expect(copyButton.locator(".lucide-check")).toHaveCount(0);
  });

  test("8.6 reveal toggle shows and re-hides the raw credential", async ({
    page,
  }) => {
    await injectExchanges(page, [
      makeGetRequest(1, "/api/hdrs", undefined, [
        { name: "authorization", value: "Bearer real-secret-token" },
      ]),
      makeResponse(1, "200 OK", undefined, undefined, []),
    ]);
    await openHeadersTab(page);

    const panel = reqPanel(page);

    // Masked by default; raw value hidden.
    await expect(panel.getByText("Bearer **********")).toBeVisible();
    await expect(panel.getByText("Bearer real-secret-token")).not.toBeVisible();

    // Reveal → raw value shown, mask gone.
    await panel.getByLabel("Reveal value").click();
    await expect(panel.getByText("Bearer real-secret-token")).toBeVisible();
    await expect(panel.getByText("Bearer **********")).not.toBeVisible();

    // Hide → masked again.
    await panel.getByLabel("Hide value").click();
    await expect(panel.getByText("Bearer **********")).toBeVisible();
  });

  test("8.7 Basic auth decode toggle cycles raw and decoded credential", async ({
    page,
  }) => {
    // "user:pass" → base64 = "dXNlcjpwYXNz"
    await injectExchanges(page, [
      makeGetRequest(1, "/api/hdrs", undefined, [
        { name: "authorization", value: "Basic dXNlcjpwYXNz" },
      ]),
      makeResponse(1, "200 OK", undefined, undefined, []),
    ]);
    await openHeadersTab(page);

    const panel = reqPanel(page);

    // No decode toggle until revealed.
    await expect(panel.getByLabel("Decode value")).toHaveCount(0);
    await panel.getByLabel("Reveal value").click();
    await expect(panel.getByText("Basic dXNlcjpwYXNz")).toBeVisible();

    // Decode → human-readable credential; raw gone.
    await panel.getByLabel("Decode value").click();
    await expect(panel.getByText("user:pass")).toBeVisible();
    await expect(panel.getByText("Basic dXNlcjpwYXNz")).not.toBeVisible();

    // Back to raw.
    await panel.getByLabel("Show raw value").click();
    await expect(panel.getByText("Basic dXNlcjpwYXNz")).toBeVisible();
  });
});
