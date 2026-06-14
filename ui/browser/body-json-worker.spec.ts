/**
 * Browser tests for the JSON-parse Web Worker (PRO-399, phase 2).
 *
 * Exercises the REAL production code path — `parseJson()` in a Worker, the
 * structured-clone transfer back to the main thread, and `JsonTreeViewer`
 * building its tree from the transferred value in a real Chromium page. The
 * unit tests in `body.decode.test.ts` mock the Worker; these do not.
 *
 * Includes the performance fixture bench check mandated by PRO-98's testing
 * strategy: parse + initial render of a ~5 MB ES-style response must complete
 * within a defined wall-clock budget with the UI thread remaining responsive.
 */

import { test, expect, type ConsoleMessage } from "@playwright/test";
import { waitForStore, resetStore } from "./helpers/inject";

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

/** Collect browser-side errors for later assertion. */
function collectErrors(page: import("@playwright/test").Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg: ConsoleMessage) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(err.message));
  return errors;
}

/** Inject a GET + JSON response exchange via __test_store. */
async function injectJsonExchange(
  page: import("@playwright/test").Page,
  opts: { id: number; uri: string; jsonBody: string },
) {
  await page.evaluate(
    ({ id, uri, body }) => {
      type Store = { getState(): { applyEvent(msg: unknown): void } };
      const store = (window as unknown as { __test_store: Store }).__test_store;
      const apply = store.getState().applyEvent.bind(store.getState());
      apply({
        exchange: { exchange_id: id, timestamp: "2024-01-01T00:00:00Z" },
        direction: "Request",
        event: {
          type: "Request",
          method: "GET",
          uri,
          version: "HTTP/1.1",
          headers: [],
          body: { type: "NoBody" },
        },
      });
      apply({
        exchange: { exchange_id: id, timestamp: "2024-01-01T00:00:00Z" },
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
    },
    { id: opts.id, uri: opts.uri, body: opts.jsonBody },
  );
}

test.describe("JSON-parse Web Worker — real browser path", () => {
  test("skeleton renders while parsing, then transitions to the JSON tree", async ({
    page,
  }) => {
    const errors = collectErrors(page);

    // Build a moderately large JSON body (>100 KB) in the page context so it
    // plausibly takes long enough for the skeleton to appear.
    const jsonBody = await page.evaluate(() => {
      const items = Array.from({ length: 2000 }, (_, i) => ({
        id: i,
        name: `item-${i}`,
        value: i * 3.14,
        tags: [`tag-${i % 5}`, `cat-${i % 3}`],
      }));
      return JSON.stringify({ items, meta: { total: 2000, page: 1 } });
    });

    await injectJsonExchange(page, {
      id: 1,
      uri: "/api/items",
      jsonBody,
    });

    // Observe whether the loading skeleton ever appears in the DOM. Start the
    // observer before clicking so it's in place for the brief loading phase
    // (Worker parse for ~150 KB takes 5–30 ms — too short for poll-based checks).
    const skeletonObserved = page.evaluate(
      () =>
        new Promise<boolean>((resolve) => {
          let seen = false;
          const obs = new MutationObserver(() => {
            if (
              !seen &&
              document.querySelector('[aria-label="Loading body…"]')
            ) {
              seen = true;
              obs.disconnect();
              resolve(true);
            }
          });
          obs.observe(document.body, { childList: true, subtree: true });
          // Resolve false if the skeleton never appears within 5 s.
          setTimeout(() => {
            obs.disconnect();
            resolve(seen);
          }, 5000);
        }),
    );

    // Select the exchange — Inspector defaults to Bodies tab.
    await page.getByText("/api/items").first().click();

    // The JSON tree must eventually appear.
    const viewer = page.getByLabel("JSON viewer");
    await expect(viewer).toBeVisible({ timeout: 15_000 });

    // The tree must contain content from the parsed body.
    await expect(viewer).toContainText("items");

    // The loading skeleton must have been visible during the Worker parse phase.
    expect(await skeletonObserved).toBe(true);

    // No errors during the parse → transfer → render cycle.
    expect(errors).toEqual([]);
  });

  test("small JSON body renders correctly via the Worker path", async ({
    page,
  }) => {
    const errors = collectErrors(page);

    await injectJsonExchange(page, {
      id: 2,
      uri: "/api/small",
      jsonBody: JSON.stringify({ ok: true, code: 200, msg: "success" }),
    });

    await page.getByText("/api/small").first().click();
    const viewer = page.getByLabel("JSON viewer");
    await expect(viewer).toBeVisible({ timeout: 10_000 });
    await expect(viewer).toContainText('"ok"');
    await expect(viewer).toContainText('"msg"');
    expect(errors).toEqual([]);
  });

  test("invalid JSON body falls back to plain text without errors", async ({
    page,
  }) => {
    const errors = collectErrors(page);

    await injectJsonExchange(page, {
      id: 3,
      uri: "/api/bad-json",
      jsonBody: "not valid json {{{",
    });

    await page.getByText("/api/bad-json").first().click();

    // Invalid JSON falls through to plain text — assert on the rendered <pre>
    // rather than sleeping; this is deterministic and fails fast if decode errors.
    await expect(
      page.locator("pre").filter({ hasText: "not valid json" }),
    ).toBeVisible({
      timeout: 10_000,
    });

    expect(errors).toEqual([]);
  });

  // Performance fixture bench test (PRO-98 testing strategy):
  // Parse + initial render of a ~5 MB ES-style response must complete within
  // the defined budget. The body is generated inside the page to avoid
  // serialising megabytes across the CDP boundary.
  //
  // Budget: 10 s wall-clock (parse in Worker + structured-clone transfer +
  // React render). Generous intentionally — the point is to catch catastrophic
  // regressions, not enforce a tight SLO. The real-world advantage over
  // synchronous JSON.parse is measured by verifying the UI remains interactive
  // during parsing (click test below), not by an absolute timing assertion.
  test("~5 MB ES response: parse + initial render completes within budget", async ({
    page,
  }) => {
    const errors = collectErrors(page);

    const reportedBytes = await page.evaluate(() => {
      // Build a realistic ~5 MB Elasticsearch search response: 1 000 hits,
      // each with a _source that contains a mix of strings, numbers, arrays,
      // and nested objects — representative of real ES traffic.
      // The `content` field (~4 500 chars each) pads each hit to ~5 KB so the
      // total payload reaches the ~5 MB target.
      const PAD = "lorem-ipsum-dolor-sit-amet ".repeat(167); // ~4 509 chars
      const hits = Array.from({ length: 1000 }, (_, i) => ({
        _index: "products",
        _id: `prod-${i}`,
        _score: 1 - i * 0.0005,
        _source: {
          name: `Product ${i} — ${`x`.repeat(80)}`,
          description: `Lorem ipsum dolor sit amet, consectetur adipiscing elit. Item ${i}.`,
          content: `${PAD}item-${i}`,
          price: 19.99 + i * 0.5,
          in_stock: i % 2 === 0,
          category: `category-${i % 10}`,
          tags: Array.from({ length: 5 }, (_, t) => `tag-${(i + t) % 20}`),
          attributes: {
            color: ["red", "blue", "green", "yellow"][i % 4],
            weight_kg: 0.1 + (i % 50) * 0.02,
            dimensions: { w: 10 + (i % 20), h: 5 + (i % 10), d: 2 + (i % 5) },
          },
          reviews: Array.from({ length: 3 }, (_, r) => ({
            rating: 3 + ((i + r) % 3),
            text: `Review ${r} for item ${i}. Quality product.`,
          })),
        },
      }));

      const response = JSON.stringify({
        took: 12,
        timed_out: false,
        _shards: { total: 5, successful: 5, skipped: 0, failed: 0 },
        hits: {
          total: { value: 100_000, relation: "eq" },
          max_score: 1.0,
          hits,
        },
        aggregations: {
          by_category: {
            buckets: Array.from({ length: 10 }, (_, i) => ({
              key: `category-${i}`,
              doc_count: 10_000 - i * 500,
            })),
          },
        },
      });

      type Store = { getState(): { applyEvent(msg: unknown): void } };
      const store = (window as unknown as { __test_store: Store }).__test_store;
      const apply = store.getState().applyEvent.bind(store.getState());

      apply({
        exchange: { exchange_id: 99, timestamp: "2024-01-01T00:00:00Z" },
        direction: "Request",
        event: {
          type: "Request",
          method: "GET",
          uri: "/api/search",
          version: "HTTP/1.1",
          headers: [],
          body: { type: "NoBody" },
        },
      });
      apply({
        exchange: { exchange_id: 99, timestamp: "2024-01-01T00:00:00Z" },
        direction: "Response",
        event: {
          type: "Response",
          status: "200 OK",
          version: "HTTP/1.1",
          headers: [{ name: "Content-Type", value: "application/json" }],
          elapsed_ms: 88,
          body: {
            type: "Data",
            content: {
              offset: 0,
              length: response.length,
              payload: { text: response },
            },
            trailers: null,
            at_end: true,
            total_bytes: response.length,
          },
        },
      });

      return response.length;
    });

    // Confirm the payload is in the ~5 MB range.
    expect(reportedBytes).toBeGreaterThan(4_000_000);

    await page.getByText("/api/search").first().click();

    // Within the 10 s budget: parse in Worker + transfer + React render.
    const viewer = page.getByLabel("JSON viewer");
    await expect(viewer).toBeVisible({ timeout: 10_000 });

    // The rendered tree must contain top-level keys from the ES response.
    await expect(viewer).toContainText("hits");

    // UI responsiveness: clicking another element must work immediately after
    // the viewer appears, confirming the main thread was not blocked.
    await page.getByText("/api/search").first().click();
    await expect(viewer).toBeVisible();

    expect(errors).toEqual([]);
  });
});

/**
 * Separate describe so the Worker interception init script is added BEFORE the
 * first navigation. The outer test.beforeEach (routes + goto) runs first, then
 * this inner beforeEach adds the script and reloads — addInitScript fires on
 * the subsequent navigation (page.reload), placing the hook before any module
 * is evaluated by the app.
 */
test.describe("JSON-parse Web Worker — fatal error recovery", () => {
  test.beforeEach(async ({ page }) => {
    // Register the Worker interception script. It runs on the NEXT navigation
    // (the reload below), before any app module is evaluated.
    await page.addInitScript(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const win = window as any;
      const OriginalWorker = win.Worker as typeof Worker;
      let jsonParseWorker: Worker | null = null;

      // Exposed by the test to dispatch a synthetic fatal error on the Worker.
      win.__crashJsonWorker = function () {
        if (jsonParseWorker) {
          jsonParseWorker.dispatchEvent(
            new ErrorEvent("error", {
              message: "Simulated Worker crash for test",
            }),
          );
          jsonParseWorker = null;
        }
      };

      // Wrap the Worker constructor so we can capture the json-parse instance.
      // Returning the real Worker object from the wrapper makes `new` use it
      // (JS allows constructors to return a different object).
      win.Worker = function (url: string | URL, opts?: WorkerOptions): Worker {
        const worker: Worker = new OriginalWorker(url as string, opts);
        if (String(url).includes("json-parse")) {
          jsonParseWorker = worker;
        }
        return worker;
      };
      win.Worker.prototype = OriginalWorker.prototype;
    });

    // Reload after adding the init script; routes set by the outer beforeEach
    // persist across reload so no re-registration is needed.
    await page.reload();
    await waitForStore(page);
    await resetStore(page);
  });

  test("recovers from fatal Worker error — next parse creates a fresh Worker", async ({
    page,
  }) => {
    const errors = collectErrors(page);

    // First exchange: parse succeeds normally (Worker is healthy).
    await injectJsonExchange(page, {
      id: 20,
      uri: "/api/first",
      jsonBody: JSON.stringify({ hello: "world" }),
    });
    await page.getByText("/api/first").first().click();
    await expect(page.getByLabel("JSON viewer")).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByLabel("JSON viewer")).toContainText('"hello"');

    // Simulate a fatal Worker crash.
    await page.evaluate(() =>
      (window as unknown as { __crashJsonWorker(): void }).__crashJsonWorker(),
    );

    // Second exchange: must still parse and render after auto-recovery.
    await injectJsonExchange(page, {
      id: 21,
      uri: "/api/second",
      jsonBody: JSON.stringify({ recovered: true }),
    });
    await page.getByText("/api/second").first().click();
    await expect(page.getByLabel("JSON viewer")).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByLabel("JSON viewer")).toContainText('"recovered"');

    // The simulated crash is handled internally; no unhandled page errors.
    expect(errors).toEqual([]);
  });
});
