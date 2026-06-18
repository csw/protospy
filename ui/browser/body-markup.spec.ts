import { test, expect } from "@playwright/test";
import { injectExchanges, resetStore, waitForStore } from "./helpers/inject";
import {
  makeGetRequest,
  makeHtmlResponse,
  makeXmlResponse,
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

test.describe("Inspector — HTML/XML formatted view (PRO-414)", () => {
  test("HTML body renders syntax-highlighted and re-indented by default", async ({
    page,
  }) => {
    await injectExchanges(page, [
      makeGetRequest(1, "/index.html"),
      makeHtmlResponse(1),
    ]);
    await page.getByText("/index.html").first().click();

    const viewer = page.getByLabel("HTML viewer");
    await expect(viewer).toBeVisible({ timeout: 30_000 });

    // Syntax highlighting: at least one tag-colored token is present.
    await expect(viewer.locator(".text-markup-tag").first()).toBeVisible();
    // Re-indentation: the minified one-line source becomes several lines.
    expect(await viewer.getByTestId("markup-line").count()).toBeGreaterThan(3);
  });

  test("XML body renders syntax-highlighted and re-indented by default", async ({
    page,
  }) => {
    await injectExchanges(page, [
      makeGetRequest(1, "/service.xml"),
      makeXmlResponse(1),
    ]);
    await page.getByText("/service.xml").first().click();

    const viewer = page.getByLabel("XML viewer");
    await expect(viewer).toBeVisible({ timeout: 30_000 });
    await expect(viewer.locator(".text-markup-tag").first()).toBeVisible();
    // The SOAP envelope re-indents to several lines.
    expect(await viewer.getByTestId("markup-line").count()).toBeGreaterThan(5);
  });

  test("large XML body virtualizes — only a subset of lines in the DOM — and scrolls", async ({
    page,
  }) => {
    const reportedSize = await page.evaluate(() => {
      // ~20k elements, minified onto one wire line; the formatter re-indents
      // them into ~20k display lines.
      let inner = "";
      for (let i = 0; i < 20000; i++) {
        inner += `<item id="${i}"><name>item-${i}</name></item>`;
      }
      const body = `<?xml version="1.0"?><root>${inner}</root>`;

      type Store = { getState(): { applyEvent(msg: unknown): void } };
      const store = (window as unknown as { __test_store: Store }).__test_store;
      const req = {
        exchange: { exchange_id: 1, timestamp: "2024-01-01T00:00:00Z" },
        direction: "Request",
        event: {
          type: "Request",
          method: "GET",
          uri: "/api/large.xml",
          version: "HTTP/1.1",
          headers: [],
          body: { type: "NoBody" },
        },
      };
      const res = {
        exchange: { exchange_id: 1, timestamp: "2024-01-01T00:00:00Z" },
        direction: "Response",
        event: {
          type: "Response",
          status: "200 OK",
          version: "HTTP/1.1",
          headers: [{ name: "Content-Type", value: "application/xml" }],
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
      };
      store.getState().applyEvent(req);
      store.getState().applyEvent(res);
      return body.length;
    });

    expect(reportedSize).toBeGreaterThan(500_000);

    await page.getByText("/api/large.xml").first().click();

    const viewer = page.getByLabel("XML viewer");
    // If the format/tokenize/render path choked on the large body, this fails.
    await expect(viewer).toBeVisible({ timeout: 30_000 });

    // Virtualization: with ~60k+ display lines, only a small windowed subset is
    // ever in the DOM (visible rows + overscan), not every line.
    const domLines = await viewer.getByTestId("markup-line").count();
    expect(domLines).toBeGreaterThan(0);
    expect(domLines).toBeLessThan(500);

    // The virtual content is tall enough to scroll, and scrolling takes effect.
    const maxScroll = await viewer.evaluate((el) => {
      let max = 0;
      let cur: HTMLElement | null = el as HTMLElement;
      while (cur) {
        cur.scrollTop = 1000;
        if (cur.scrollTop > max) max = cur.scrollTop;
        cur = cur.parentElement;
      }
      return max;
    });
    expect(maxScroll).toBeGreaterThanOrEqual(800);
  });
});
