import { test, expect } from "@playwright/test";
import { resetStore, waitForStore } from "./helpers/inject";

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

test.describe("Inspector — large body rendering", () => {
  // Generate a ~2 MB pretty-printed JSON body directly in the page context
  // (faster than serializing across CDP) and inject the GET/200 exchange via
  // the test store. Verifies the JsonViewer renders within Playwright's
  // default action timeout and that scrolling the viewer still moves.
  test("renders a 2MB JSON body and scrolls without freezing", async ({
    page,
  }) => {
    const reportedSize = await page.evaluate(() => {
      const items: Array<Record<string, unknown>> = [];
      // 20_000 rows × ~100 bytes each ≈ 2 MB once pretty-printed.
      for (let i = 0; i < 20000; i++) {
        items.push({
          id: i,
          name: `item-${i}`,
          payload: "x".repeat(60),
        });
      }
      const body = JSON.stringify({ items }, null, 2);

      type Store = {
        getState(): { applyEvent(msg: unknown): void };
      };
      const store = (window as unknown as { __test_store: Store }).__test_store;
      store.getState().applyEvent({
        exchange: { exchange_id: 1, timestamp: "2024-01-01T00:00:00Z" },
        direction: "Request",
        event: {
          type: "Request",
          method: "GET",
          uri: "/api/large",
          version: "HTTP/1.1",
          headers: [],
          body: { type: "NoBody" },
        },
      });
      store.getState().applyEvent({
        exchange: { exchange_id: 1, timestamp: "2024-01-01T00:00:00Z" },
        direction: "Response",
        event: {
          type: "Response",
          status: "200 OK",
          version: "HTTP/1.1",
          headers: [{ name: "Content-Type", value: "application/json" }],
          elapsed_ms: 42,
          body: {
            type: "Data",
            content: {
              offset: 0,
              length: body.length,
              payload: { text: body },
            },
            trailers: null,
            at_end: true,
            total_bytes: body.length,
          },
        },
      });
      return body.length;
    });

    // Sanity check the payload is in the megabyte range.
    expect(reportedSize).toBeGreaterThan(1_500_000);

    // Select the exchange; Inspector defaults to the Bodies tab on selection.
    await page.getByText("/api/large").first().click();

    // The JsonViewer eventually mounts. The default 30s test timeout caps the
    // assertion — if the render or decode chokes, this fails loudly.
    const viewer = page.getByLabel("JSON viewer");
    await expect(viewer).toBeVisible({ timeout: 30_000 });

    // Scroll the viewer 500px. BodyPane wraps the JsonViewer in its own
    // overflow-auto container, so try the viewer itself plus its overflow
    // ancestors — whichever container is the active scroller should accept
    // the scrollTop. A frozen / unmounted viewer would leave every
    // candidate at 0.
    const maxScroll = await viewer.evaluate((el) => {
      let max = 0;
      let cur: HTMLElement | null = el as HTMLElement;
      while (cur) {
        cur.scrollTop = 500;
        if (cur.scrollTop > max) max = cur.scrollTop;
        cur = cur.parentElement;
      }
      return max;
    });
    expect(maxScroll).toBeGreaterThanOrEqual(400);
  });
});
