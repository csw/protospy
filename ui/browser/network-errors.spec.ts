import { test, expect } from "@playwright/test";
import { injectExchanges, resetStore, waitForStore } from "./helpers/inject";
import { applyScene, waitForSceneHarness } from "./helpers/scenes";
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
  await page.route("**/service/test-backend/events", (route) =>
    route.fulfill({ contentType: "text/event-stream", body: "" }),
  );
  await page.goto("/");
  await waitForStore(page);
  await resetStore(page);

  // The rows-mode list shows the full status line + an "Error" treatment;
  // switch from the default table mode so list-level assertions work.
  await page.getByLabel("Rows view").click();
});

// The context bar sits above the inspector; locate it via the Prev button.
function contextBar(page: import("@playwright/test").Page) {
  return page
    .getByRole("button", { name: "Previous request" })
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

    // Context bar status shows "Error" (message is tooltip-only, not inline)
    await expect(contextBar(page).getByTestId("status-code")).toHaveText(
      "Error",
    );
    await expect(contextBar(page).getByTestId("status-code")).toHaveAttribute(
      "data-error",
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
    await expect(contextBar(page).getByTestId("status-code")).toHaveText(
      "Error",
    );
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

    // The arrived status and the mid-stream error are combined in one status
    // treatment: "200 ✕" (the status code that arrived + an error mark).
    const status = contextBar(page).getByTestId("status-code");
    await expect(status).toHaveText("200 ✕");
    await expect(status).toHaveAttribute("data-error");

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
    await page.getByLabel("Table view").click();
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

    // Table view: a transport error with no status shows "Error" as a badge chip
    // (kept deviation §1 — never "ERR") with destructive token treatment.
    const statusCell = page
      .locator("button[role='option'] [data-testid='status-code']")
      .first();
    await expect(statusCell).toBeVisible();
    await expect(statusCell).toHaveText("Error");
    await expect(statusCell).toHaveAttribute("data-slot", "badge");
    await expect(statusCell).toHaveClass(/text-destructive/);
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

    // Table view: mid-stream error shows "200 ✕" in text-client (amber warning
    // tone — not text-error, which is reserved for pure transport failures).
    const statusCell = page
      .locator("button[role='option'] span.text-client")
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

// ---------------------------------------------------------------------------
// Layout: long error text must not overflow the body pane (PRO-383)
// ---------------------------------------------------------------------------

test.describe("Network error rendering — long error text layout (PRO-383)", () => {
  test("long-error scene: error text wraps without horizontal overflow at 1280px", async ({
    page,
  }) => {
    await page.route("**/info", (route) =>
      route.fulfill({ json: { services: [] } }),
    );
    await page.goto("/");
    await waitForStore(page);
    await waitForSceneHarness(page);
    await page.setViewportSize({ width: 1280, height: 900 });
    await applyScene(page, "long-error");

    // Wait for the error panel to render.
    await expect(page.getByRole("alert")).toBeVisible();

    // The body pane scroll container must not overflow horizontally.
    const overflow = await page.evaluate(() => {
      const alert = document.querySelector("[role='alert']");
      if (!alert) return { scrollWidth: 0, clientWidth: 0 };
      return {
        scrollWidth: alert.scrollWidth,
        clientWidth: alert.clientWidth,
      };
    });
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
  });
});
