import { test, expect } from "@playwright/test";
import { injectExchanges, resetStore, waitForStore } from "./helpers/inject";
import {
  makeGetRequest,
  makeProxyError,
  makeResponse,
} from "./fixtures/exchanges";

// PRO-217: verify the UI renders proxy-level network-error exchanges
// without breaking. The Rust proxy emits an `Error` event with a generic
// hyper-derived message string when it cannot reach the upstream or
// fails mid-stream. These tests exercise three representative scenarios:
//   1. Connect refused (Request-direction error, no response ever)
//   2. Idle/read timeout (Request-direction error after the request was sent)
//   3. Mid-stream disconnect (Response-direction error after partial response)
//
// The goal is to verify the UI does not crash and renders an error
// indicator for each — not to assert the exact error text, which is a
// passthrough of hyper's string and outside this ticket's scope.

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

// The context bar sits above the inspector; locate it via the Prev button.
function contextBar(page: import("@playwright/test").Page) {
  return page
    .getByRole("button", { name: "Previous exchange" })
    .locator("../..");
}

test.describe("Network error rendering — proxy-level failures", () => {
  test("connection refused: list shows Error, context bar shows Network error, inspector does not crash", async ({
    page,
  }) => {
    const msg =
      "client error (Connect): tcp connect error: Connection refused (os error 61)";
    await injectExchanges(page, [
      makeGetRequest(1, "/api/connect-refused"),
      makeProxyError(1, "Request", msg),
    ]);

    // Exchange-list row shows Error badge
    await expect(page.getByText("Error").first()).toBeVisible();

    await page.getByText("/api/connect-refused").first().click();

    // Context bar shows Network error label + message
    await expect(contextBar(page).getByText("Network error")).toBeVisible();
    await expect(contextBar(page).getByText(msg)).toBeVisible();

    // Request body pane shows the same error message
    await page.getByRole("tab", { name: "Bodies" }).click();
    await expect(page.getByTestId("body-error").getByText(msg)).toBeVisible();

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

    await expect(page.getByText("Error").first()).toBeVisible();
    await page.getByText("/api/timeout").first().click();
    await expect(contextBar(page).getByText("Network error")).toBeVisible();

    // No status code badge in context bar (status is undefined for a
    // failed-to-connect exchange)
    await expect(contextBar(page).getByText("200 OK")).toHaveCount(0);
  });

  test("mid-stream disconnect: partial response + Response-direction error", async ({
    page,
  }) => {
    // The proxy got headers + part of the body, then upstream disconnected.
    // Both the list and the context bar should surface this: the status
    // code stays primary (the response did start), and an "interrupted"
    // / "Interrupted" indicator flags that the body never completed.
    const msg =
      "error reading a body from connection: connection reset by peer";
    await injectExchanges(page, [
      makeGetRequest(3, "/api/mid-stream"),
      makeResponse(3, "200 OK", "partial-body-prefix..."),
      makeProxyError(3, "Response", msg),
    ]);

    // List row shows status + an "interrupted" indicator
    await expect(page.getByTestId("error-indicator").first()).toBeVisible();

    await page.getByText("/api/mid-stream").first().click();

    // Status is rendered (200 OK) — the response started successfully.
    await expect(contextBar(page).getByText("200 OK")).toBeVisible();

    // Context bar shows the "Interrupted" indicator and the message.
    await expect(contextBar(page).getByText("Interrupted")).toBeVisible();
    await expect(contextBar(page).getByText(msg)).toBeVisible();

    // Response body pane surfaces the error inline (above the partial body).
    await page.getByRole("tab", { name: "Bodies" }).click();
    await expect(page.getByTestId("body-error").getByText(msg)).toBeVisible();

    // Inspector remains operable across tabs.
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
    await expect(page.getByText("Error").first()).toBeVisible();
  });
});
