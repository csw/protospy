import { test, expect } from "@playwright/test";
import { getStoreState, waitForStore } from "./helpers/inject";

test.describe("Service selection", () => {
  test("auto-selects the first service on load", async ({ page }) => {
    await page.route("**/info", (route) =>
      route.fulfill({
        json: {
          services: [
            { name: "first-svc", addr: "1", target: "t1", subscribers: 0 },
            { name: "second-svc", addr: "2", target: "t2", subscribers: 0 },
          ],
        },
      }),
    );
    await page.route("**/service/*/events", (route) =>
      route.fulfill({ contentType: "text/event-stream", body: "" }),
    );

    await page.goto("/");
    await waitForStore(page);

    // AppShell's effect A picks `services[0]` after /info resolves.
    await expect.poll(() => getStoreState(page, "service")).toBe("first-svc");
  });

  test("selecting a second service opens a new SSE subscription", async ({
    page,
  }) => {
    // Per-service hit counters for the SSE endpoint
    const hits = new Map<string, number>();

    await page.route("**/info", (route) =>
      route.fulfill({
        json: {
          services: [
            { name: "alpha", addr: "1", target: "t1", subscribers: 0 },
            { name: "beta", addr: "2", target: "t2", subscribers: 0 },
          ],
        },
      }),
    );
    await page.route("**/service/*/events", (route) => {
      const url = route.request().url();
      const m = /\/service\/([^/]+)\/events/.exec(url);
      const name = m ? decodeURIComponent(m[1]) : "?";
      hits.set(name, (hits.get(name) ?? 0) + 1);
      // Hold the response open like a real SSE stream — fulfilling with an
      // empty body would close immediately and cause `EventSource` to retry,
      // double-counting hits.
      route.fulfill({
        contentType: "text/event-stream",
        body: ": keep-alive\n\n",
      });
    });

    await page.goto("/");
    await waitForStore(page);

    // First service is alpha — wait for the auto-subscribe to land.
    await expect.poll(() => getStoreState(page, "service")).toBe("alpha");
    await expect.poll(() => hits.get("alpha") ?? 0).toBeGreaterThanOrEqual(1);
    expect(hits.get("beta") ?? 0).toBe(0);

    // Open the service dropdown and pick the second service.
    await page.getByRole("button", { name: /alpha/ }).click();
    await page.getByRole("menuitem", { name: /beta/ }).click();

    // Store updates and a new SSE subscription fires for the second service.
    await expect.poll(() => getStoreState(page, "service")).toBe("beta");
    await expect.poll(() => hits.get("beta") ?? 0).toBeGreaterThanOrEqual(1);
  });
});
