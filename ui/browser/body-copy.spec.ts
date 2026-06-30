import { test, expect } from "./fixtures/coverage";
import { injectExchanges, resetStore, waitForStore } from "./helpers/inject";
import { makeGetRequest, makeResponse } from "./fixtures/exchanges";

// Exercises the real BodyPane copy button on the rendered page: a real click,
// the real `navigator.clipboard` path (stubbed only to record what was written),
// and the real `sonner` toast host. The component unit test mocks both clipboard
// and `sonner`; this is the companion test on the production path (testing.md,
// "Test the real production code path").
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

test.describe("BodyPane — copy button", () => {
  test("copies the decoded body text and shows a success toast", async ({
    page,
  }) => {
    // Record clipboard writes without granting real clipboard permission.
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

    // A text/plain body so the copied value equals the fixture verbatim — a
    // JSON body would be pretty-printed by the decode pipeline, and the button
    // copies the decoded text, not the wire bytes.
    const bodyText = "hello, clipboard";
    await injectExchanges(page, [
      makeGetRequest(1, "/api/thing"),
      makeResponse(1, "200 OK", bodyText, undefined, [
        { name: "content-type", value: "text/plain" },
      ]),
    ]);

    await page.getByText("/api/thing").first().click();

    // The GET request side has no body, so the response pane owns the only copy
    // button on the default Bodies tab. It is labelled "Copy" at rest.
    const copyButton = page.getByRole("button", { name: "Copy" });
    await expect(copyButton).toBeEnabled();
    await copyButton.click();

    // Real clipboard path received the decoded body text.
    const copied = await page.evaluate(() => window.__clipboard);
    expect(copied).toBe(bodyText);

    // The `sonner` toast host (mounted in App) renders the success toast, and
    // the button flips to its copied state.
    await expect(page.getByText("Copied to clipboard")).toBeVisible();
    await expect(page.getByRole("button", { name: "Copied" })).toBeVisible();
  });
});
