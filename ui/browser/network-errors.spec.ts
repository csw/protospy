import { test, expect } from "@playwright/test";
import { injectExchanges, resetStore, waitForStore } from "./helpers/inject";
import {
  makeGetRequest,
  makeProxyError,
  makeResponse,
} from "./fixtures/exchanges";

// PRO-217 + PRO-220: verify the UI renders proxy-level network-error
// exchanges with proper error display. The Rust proxy emits an `Error`
// event with a generic hyper-derived message string when it cannot reach
// the upstream or fails mid-stream. These tests exercise representative
// scenarios including the refined error display (PRO-220):
//   - "Error" badge in the list (not "ERR")
//   - "Error" label + error message in the context bar (not "NET ERR")
//   - Error message displayed in the body pane
//   - Mid-stream errors show both status and error indicator

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

  // The rows-mode list shows the full status line + an "Error" treatment;
  // switch from the default table mode so list-level assertions work.
  await page.getByLabel("Rows mode").click();
});

// The context bar sits above the inspector; locate it via the Prev button.
function contextBar(page: import("@playwright/test").Page) {
  return page
    .getByRole("button", { name: "Previous exchange" })
    .locator("../..");
}

test.describe("Network error rendering — proxy-level failures", () => {
  test("connection refused: list shows Error badge, context bar shows error message, body pane shows error", async ({
    page,
  }) => {
    await injectExchanges(page, [
      makeGetRequest(1, "/api/connect-refused"),
      makeProxyError(
        1,
        "Request",
        "client error (Connect): tcp connect error: Connection refused (os error 61)",
      ),
    ]);

    // Exchange-list row shows Error badge
    await expect(
      page.locator('[data-testid="status-code"][data-error]').first(),
    ).toBeVisible();
    await expect(
      page.locator('[data-testid="status-code"][data-error]').first(),
    ).toHaveText("Error");

    await page.getByText("/api/connect-refused").first().click();

    // Context bar shows "Error" label (message is tooltip-only, not inline)
    await expect(contextBar(page).getByTestId("error-indicator")).toBeVisible();
    await expect(contextBar(page).getByTestId("error-indicator")).toHaveText(
      "Error",
    );

    // Body pane shows the error message instead of blank. Scope to the
    // inspector tabpanel: the list row now also shows the error message inline,
    // so an unscoped match would be ambiguous.
    await expect(
      page
        .getByRole("tabpanel")
        .getByText("Connection refused", { exact: false }),
    ).toBeVisible();

    // Inspector tabs remain functional — clicking each does not throw
    await page.getByRole("tab", { name: "Headers" }).click();
    await expect(page.getByRole("tab", { name: "Headers" })).toHaveAttribute(
      "data-state",
      "active",
    );
    await page.getByRole("tab", { name: "Timing" }).click();
    await expect(page.getByRole("tab", { name: "Timing" })).toHaveAttribute(
      "data-state",
      "active",
    );
    await page.getByRole("tab", { name: "Bodies" }).click();
    await expect(page.getByRole("tab", { name: "Bodies" })).toHaveAttribute(
      "data-state",
      "active",
    );
  });

  test("upstream timeout: error after request sent renders without crash", async ({
    page,
  }) => {
    await injectExchanges(page, [
      makeGetRequest(2, "/api/timeout"),
      makeProxyError(
        2,
        "Request",
        "error trying to connect: operation timed out",
      ),
    ]);

    await expect(
      page.locator('[data-testid="status-code"][data-error]').first(),
    ).toBeVisible();
    await page.getByText("/api/timeout").first().click();
    await expect(contextBar(page).getByTestId("error-indicator")).toBeVisible();

    // No status code badge in context bar (status is undefined for a
    // failed-to-connect exchange)
    await expect(contextBar(page).getByText("200 OK")).toHaveCount(0);
  });

  test("mid-stream disconnect: shows both status and Error badge", async ({
    page,
  }) => {
    // The proxy got headers + part of the body, then upstream disconnected.
    // With PRO-220, both the status and the Error badge are shown — the
    // error is no longer invisible when a status code is present.
    await injectExchanges(page, [
      makeGetRequest(3, "/api/mid-stream"),
      makeResponse(3, "200 OK", "partial-body-prefix..."),
      makeProxyError(
        3,
        "Response",
        "error reading a body from connection: connection reset by peer",
      ),
    ]);

    await page.getByText("/api/mid-stream").first().click();

    // Status is rendered (200 OK) — the response started successfully.
    await expect(contextBar(page).getByText("200 OK")).toBeVisible();

    // The Error indicator is also visible (mid-stream interruption).
    // Message is tooltip-only, not inline in the indicator.
    await expect(contextBar(page).getByTestId("error-indicator")).toBeVisible();
    await expect(contextBar(page).getByTestId("error-indicator")).toHaveText(
      "Error",
    );

    // The list row shows both status and error badge
    await expect(
      page.locator('[data-testid="status-code"][data-error]').first(),
    ).toBeVisible();

    // Verify the inspector remains operable.
    await page.getByRole("tab", { name: "Headers" }).click();
    await expect(page.getByRole("tab", { name: "Headers" })).toHaveAttribute(
      "data-state",
      "active",
    );
  });

  test("standalone error event (no preceding Request) still renders", async ({
    page,
  }) => {
    // Defensive: the reducer creates an exchange from an Error event even
    // if no Request event was ever seen. The UI should not crash on this.
    await injectExchanges(page, [
      makeProxyError(99, "Request", "dns error: failed to lookup address"),
    ]);

    // A row exists for this exchange (no URI yet → falls back to "/")
    await expect(
      page.locator('[data-testid="status-code"][data-error]').first(),
    ).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Table-mode equivalents
// ---------------------------------------------------------------------------

test.describe("Network error rendering — table mode", () => {
  test.beforeEach(async ({ page }) => {
    // The file-level beforeEach switches to rows mode; switch back to table.
    await page.getByLabel("Table mode").click();
  });

  test("connection refused: status cell shows Error in the error color", async ({
    page,
  }) => {
    await injectExchanges(page, [
      makeGetRequest(1, "/api/connect-refused"),
      makeProxyError(
        1,
        "Request",
        "client error (Connect): tcp connect error: Connection refused (os error 61)",
      ),
    ]);

    // Table mode: a transport error with no status shows "Error" (never "ERR",
    // kept deviation §1) in text-error.
    const statusCell = page
      .locator("button[role='option'] span.text-error")
      .first();
    await expect(statusCell).toBeVisible();
    await expect(statusCell).toHaveText("Error");
  });

  test("mid-stream disconnect: status cell shows code with error marker", async ({
    page,
  }) => {
    await injectExchanges(page, [
      makeGetRequest(3, "/api/mid-stream"),
      makeResponse(3, "200 OK", "partial-body-prefix..."),
      makeProxyError(
        3,
        "Response",
        "error reading a body from connection: connection reset by peer",
      ),
    ]);

    // Table mode: mid-stream error shows "200 ✕" in text-error
    const statusCell = page
      .locator("button[role='option'] span.text-error")
      .first();
    await expect(statusCell).toBeVisible();
    await expect(statusCell).toHaveText("200 ✕");

    // Status tooltip shows the error message
    await expect(statusCell).toHaveAttribute(
      "title",
      /connection reset by peer/,
    );
  });
});
