import { test, expect } from "@playwright/test";
import {
  injectExchanges,
  resetStore,
  waitForStore,
  getStoreState,
} from "./helpers/inject";
import {
  makeCompleteExchange,
  makeRequestWithTrace,
  makeResponse,
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

// The context bar is the container that holds the Prev/Next navigation buttons.
// We locate it as the parent div of the "Previous exchange" button.
// Using xpath ".." to get the grandparent (the full bar) from the nav wrapper.
function contextBar(page: import("@playwright/test").Page) {
  // The Prev button sits inside: contextBar > div.flex > button[aria-label]
  // So we go up two levels from the button.
  return page
    .getByRole("button", { name: "Previous exchange" })
    .locator("../..");
}

// ---------------------------------------------------------------------------
// 1. Method + status + path display
// ---------------------------------------------------------------------------

test.describe("ContextBar — method, status, and path display", () => {
  test("1.1 shows method badge, status, and path for selected exchange", async ({
    page,
  }) => {
    await injectExchanges(page, [
      ...makeCompleteExchange(1, "GET", "/api/movies", "200 OK"),
    ]);

    // Select the exchange by clicking the URI text in the list
    await page.getByText("/api/movies").first().click();

    // Context bar should display the method badge, status, and path
    const bar = contextBar(page);
    await expect(bar.getByText("GET")).toBeVisible();
    await expect(bar.getByText("200 OK")).toBeVisible();
    await expect(bar.getByText("/api/movies")).toBeVisible();
  });

  test("1.2 pending exchange shows pulsing amber dot and 'pending' text", async ({
    page,
  }) => {
    // Inject only a request, no response
    await injectExchanges(page, [
      {
        exchange: { exchange_id: 1, timestamp: "2024-01-01T00:00:00Z" },
        direction: "Request",
        event: {
          type: "Request",
          method: "GET",
          uri: "/api/pending",
          version: "HTTP/1.1",
          headers: [],
          body: { type: "NoBody" },
        },
      },
    ]);

    await page.getByText("/api/pending").first().click();

    // Pending state shows "pending" text (no status, no error)
    await expect(
      contextBar(page).getByText("pending", { exact: true }),
    ).toBeVisible();
  });

  test("1.3 error exchange shows Error with message", async ({ page }) => {
    // Inject a request, then inject an error event
    await injectExchanges(page, [
      {
        exchange: { exchange_id: 1, timestamp: "2024-01-01T00:00:00Z" },
        direction: "Request",
        event: {
          type: "Request",
          method: "GET",
          uri: "/api/error",
          version: "HTTP/1.1",
          headers: [],
          body: { type: "NoBody" },
        },
      },
      {
        exchange: { exchange_id: 1, timestamp: "2024-01-01T00:00:01Z" },
        direction: "Request",
        event: {
          type: "Error",
          message: "connection refused",
        },
      },
    ]);

    await page.getByText("/api/error").first().click();

    // Error state shows "Error" label (message is in the tooltip, not inline)
    const indicator = contextBar(page).getByTestId("error-indicator");
    await expect(indicator).toBeVisible();
    await expect(indicator).toHaveText("Error");
  });
});

// ---------------------------------------------------------------------------
// 2. Prev/Next navigation
// ---------------------------------------------------------------------------

test.describe("ContextBar — prev/next navigation", () => {
  test("2.1 clicking Next moves to older exchange", async ({ page }) => {
    // Inject 3 exchanges with distinct timestamps so order is deterministic.
    // Default sort is newest-first: exchange 3, 2, 1 (top to bottom).
    await injectExchanges(page, [
      ...makeCompleteExchange(1, "GET", "/first", "200 OK", {
        ts: "2024-01-01T00:00:01Z",
      }),
      ...makeCompleteExchange(2, "GET", "/second", "200 OK", {
        ts: "2024-01-01T00:00:02Z",
      }),
      ...makeCompleteExchange(3, "GET", "/third", "200 OK", {
        ts: "2024-01-01T00:00:03Z",
      }),
    ]);

    // Select the middle exchange (exchange 2) by clicking its URI
    await page.getByText("/second").first().click();

    // Click Next (goes toward older, i.e. /first)
    await page.getByRole("button", { name: "Next exchange" }).click();

    // After clicking Next, /first should now be selected and shown in context bar
    await expect(contextBar(page).getByText("/first")).toBeVisible();
  });

  test("2.2 clicking Prev moves to newer exchange", async ({ page }) => {
    await injectExchanges(page, [
      ...makeCompleteExchange(1, "GET", "/first", "200 OK", {
        ts: "2024-01-01T00:00:01Z",
      }),
      ...makeCompleteExchange(2, "GET", "/second", "200 OK", {
        ts: "2024-01-01T00:00:02Z",
      }),
      ...makeCompleteExchange(3, "GET", "/third", "200 OK", {
        ts: "2024-01-01T00:00:03Z",
      }),
    ]);

    // Select the middle exchange (exchange 2)
    await page.getByText("/second").first().click();

    // Click Prev (goes toward newer, i.e. /third)
    await page.getByRole("button", { name: "Previous exchange" }).click();

    // After clicking Prev, /third should now be shown in context bar
    await expect(contextBar(page).getByText("/third")).toBeVisible();
  });

  test("2.3 Prev button is disabled when on the first (newest) exchange", async ({
    page,
  }) => {
    await injectExchanges(page, [
      ...makeCompleteExchange(1, "GET", "/first", "200 OK", {
        ts: "2024-01-01T00:00:01Z",
      }),
      ...makeCompleteExchange(2, "GET", "/second", "200 OK", {
        ts: "2024-01-01T00:00:02Z",
      }),
      ...makeCompleteExchange(3, "GET", "/third", "200 OK", {
        ts: "2024-01-01T00:00:03Z",
      }),
    ]);

    // Select the newest exchange (exchange 3, which is first in newest-first order)
    await page.getByText("/third").first().click();

    // Previous button should be disabled (no newer exchange before index 0)
    await expect(
      page.getByRole("button", { name: "Previous exchange" }),
    ).toBeDisabled();
  });

  test("2.4 Next button is disabled when on the last (oldest) exchange", async ({
    page,
  }) => {
    await injectExchanges(page, [
      ...makeCompleteExchange(1, "GET", "/first", "200 OK", {
        ts: "2024-01-01T00:00:01Z",
      }),
      ...makeCompleteExchange(2, "GET", "/second", "200 OK", {
        ts: "2024-01-01T00:00:02Z",
      }),
      ...makeCompleteExchange(3, "GET", "/third", "200 OK", {
        ts: "2024-01-01T00:00:03Z",
      }),
    ]);

    // Select the oldest exchange (exchange 1, which is last in newest-first order)
    await page.getByText("/first").first().click();

    // Next button should be disabled (no older exchange after the last index)
    await expect(
      page.getByRole("button", { name: "Next exchange" }),
    ).toBeDisabled();
  });
});

// ---------------------------------------------------------------------------
// 3. Trace pill
// ---------------------------------------------------------------------------

test.describe("ContextBar — trace pill", () => {
  test("3.1 trace pill shows shortened trace ID", async ({ page }) => {
    const traceId = "abcdef1234567890abcdef1234567890";
    await injectExchanges(page, [
      makeRequestWithTrace(1, traceId, "/api/traced"),
      makeResponse(1, "200 OK"),
    ]);

    await page.getByText("/api/traced").first().click();

    // Trace pill should display "abcd…7890" (first 4 + ellipsis + last 4)
    await expect(page.getByText("abcd…7890")).toBeVisible();
  });

  test("3.2 clicking trace pill sets traceFilter in store", async ({
    page,
  }) => {
    const traceId = "abcdef1234567890abcdef1234567890";
    await injectExchanges(page, [
      makeRequestWithTrace(1, traceId, "/api/traced"),
      makeResponse(1, "200 OK"),
    ]);

    await page.getByText("/api/traced").first().click();

    // The trace pill's swatch + trace ID button has aria-label="Filter by trace".
    await page.getByLabel("Filter by trace").click();

    const traceFilter = await getStoreState(page, "traceFilter");
    expect(traceFilter).toBe(traceId);
  });
});

// ---------------------------------------------------------------------------
// 3b. Focus ring fidelity (PRO-259)
// ---------------------------------------------------------------------------

test.describe("ContextBar — focus ring fidelity", () => {
  test("3b.1 Filter by trace button shows ring on keyboard focus", async ({
    page,
  }) => {
    const traceId = "abcdef1234567890abcdef1234567890";
    await injectExchanges(page, [
      makeRequestWithTrace(1, traceId, "/api/traced"),
      makeResponse(1, "200 OK"),
    ]);

    await page.getByText("/api/traced").first().click();

    const filterBtn = page.getByLabel("Filter by trace");
    await expect(filterBtn).toBeVisible();

    // focus() via JS applies :focus but NOT :focus-visible — only
    // keyboard-initiated focus does.  Tab until the button is focused.
    await page.keyboard.press("Tab");
    // The tab order starts at the first focusable element in the
    // context bar (Prev button); keep tabbing until we reach the
    // Filter by trace button.
    while (!(await filterBtn.evaluate((el) => el === document.activeElement))) {
      await page.keyboard.press("Tab");
    }

    // Button's focus ring (focus-visible:ring-[3px] ring-ring/50) renders as a box-shadow
    const shadow = await filterBtn.evaluate(
      (el) => getComputedStyle(el).boxShadow,
    );
    // Should have a non-"none" box-shadow when :focus-visible is active
    expect(shadow).not.toBe("none");
  });

  test("3b.2 Jaeger placeholder button is disabled and not focusable", async ({
    page,
  }) => {
    const traceId = "abcdef1234567890abcdef1234567890";
    await injectExchanges(page, [
      makeRequestWithTrace(1, traceId, "/api/traced"),
      makeResponse(1, "200 OK"),
    ]);

    await page.getByText("/api/traced").first().click();

    const jaegerBtn = page.getByLabel("Open in Jaeger");
    await expect(jaegerBtn).toBeVisible();
    await expect(jaegerBtn).toBeDisabled();
  });
});

// ---------------------------------------------------------------------------
// 3c. Hover background fidelity (PRO-294)
// ---------------------------------------------------------------------------
//
// The shadcn `ghost` Button variant hovers to `bg-accent`, which in this
// project resolves to the brand blue (`--color-accent` = #2563eb / #60a5fa).
// The original hand-rolled controls had no hover background, so the active
// icon buttons override it with `hover:bg-bg-hover` (a near-transparent
// neutral) and the disabled Jaeger placeholder suppresses it with
// `hover:bg-transparent`. These tests lock in that the blue accent hover does
// not return.

test.describe("ContextBar — hover background fidelity", () => {
  // Resolve a CSS color string through getComputedStyle so it is normalized to
  // the same form the browser reports for a rendered element's backgroundColor.
  async function normalizeColor(
    page: import("@playwright/test").Page,
    value: string,
  ): Promise<string> {
    return page.evaluate((raw) => {
      const probe = document.createElement("div");
      probe.style.backgroundColor = raw;
      document.body.appendChild(probe);
      const normalized = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return normalized;
    }, value);
  }

  // Run in both themes: the ghost variant sets a separate `dark:hover:bg-accent/50`,
  // so a light-only check would miss a dark-mode blue-flash regression.
  for (const theme of ["light", "dark"] as const) {
    test(`3c.1 active icon button hovers to the neutral token, not accent blue (${theme})`, async ({
      page,
    }) => {
      await page.evaluate((t) => {
        document.documentElement.setAttribute("data-theme", t);
      }, theme);

      const traceId = "abcdef1234567890abcdef1234567890";
      await injectExchanges(page, [
        makeRequestWithTrace(1, traceId, "/api/traced"),
        makeResponse(1, "200 OK"),
      ]);

      await page.getByText("/api/traced").first().click();

      // Copy-trace is an always-enabled ghost icon button carrying
      // `hover:bg-bg-hover` — order-independent, unlike prev/next.
      const copyBtn = page.getByLabel("Copy trace ID");
      await expect(copyBtn).toBeEnabled();
      await copyBtn.hover();

      // Both tokens are theme-aware, so resolve them after setting the theme.
      const expectedNeutral = await normalizeColor(
        page,
        await page.evaluate(() =>
          getComputedStyle(document.documentElement)
            .getPropertyValue("--color-bg-hover")
            .trim(),
        ),
      );
      const accent = await normalizeColor(
        page,
        await page.evaluate(() =>
          getComputedStyle(document.documentElement)
            .getPropertyValue("--color-accent")
            .trim(),
        ),
      );

      // The control carries `transition-all`, so background-color animates over
      // ~150ms — poll until it settles rather than reading mid-transition.
      // Positive: the settled hover background is the `--color-bg-hover` neutral
      // token — and therefore not the brand-blue accent the ghost variant applies.
      await expect
        .poll(() =>
          copyBtn.evaluate((el) => getComputedStyle(el).backgroundColor),
        )
        .toBe(expectedNeutral);
      expect(expectedNeutral).not.toBe(accent);
    });
  }

  // The disabled Jaeger placeholder's hover suppression (`hover:bg-transparent`)
  // is covered by a component-level class assertion in ContextBar.test.tsx:
  // a live :hover check can't reliably distinguish "stayed transparent" from
  // "transition not yet started", and this suite avoids fixed timeouts.
});

// ---------------------------------------------------------------------------
// 4. Query params
// ---------------------------------------------------------------------------

test.describe("ContextBar — query parameters", () => {
  test("4.1 shows parsed query params for URI with query string", async ({
    page,
  }) => {
    await injectExchanges(page, [
      ...makeCompleteExchange(
        1,
        "GET",
        "/api/search?q=test&limit=10",
        "200 OK",
      ),
    ]);

    // The list item shows the path part; click it to select
    await page.getByText("/api/search").first().click();

    // Context bar shows path and parsed query params.
    // ContextBar renders: pathOnly | "?" | key=value pairs separately.
    const bar = contextBar(page);

    // Path portion
    await expect(bar.getByText("/api/search")).toBeVisible();

    // Query param keys (rendered with text-accent-ink class)
    await expect(bar.getByText("q")).toBeVisible();
    await expect(bar.getByText("limit")).toBeVisible();

    // Query param values (rendered with text-ink-2 class)
    await expect(bar.getByText("test")).toBeVisible();
    await expect(bar.getByText("10")).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// 5. Elapsed pill
// ---------------------------------------------------------------------------

test.describe("ContextBar — elapsed pill", () => {
  test("5.1 shows elapsed time pill for completed exchange", async ({
    page,
  }) => {
    await injectExchanges(page, [
      ...makeCompleteExchange(1, "GET", "/api/timed", "200 OK", {
        elapsed: 123,
      }),
    ]);

    await page.getByText("/api/timed").first().click();

    // Elapsed pill should show "123ms" in the context bar
    await expect(contextBar(page).getByText("123ms")).toBeVisible();
  });
});
