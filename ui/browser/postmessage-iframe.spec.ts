import { test, expect } from "./fixtures/coverage";

// Verifies that the Protospy UI emits proxy_connected / proxy_disconnected
// postMessages to window.parent when embedded in an iframe.
//
// The parent page is served by routing a sentinel URL (/iframe-wrapper) to an
// inline HTML response — no static file is needed. Playwright's page.route
// intercepts requests from all frames, so the SSE route works the same way it
// does in top-level tests.
//
// SSE timing: route.fulfill is atomic — once the handler returns, onopen fires
// then onerror fires as the body closes. Fulfilling immediately with a minimal
// SSE body triggers both events in sequence, so we can assert on both messages
// in a single test without any gating.
test.describe("postMessage iframe coordination", () => {
  test("emits proxy_connected then proxy_disconnected to window.parent", async ({
    page,
    baseURL,
  }) => {
    await page.route("**/info", (route) =>
      route.fulfill({ json: { services: [{ name: "test-backend" }] } }),
    );

    // Fulfill immediately — triggers onopen (→ proxy_connected) then onerror
    // (→ proxy_disconnected) when the body closes. Park subsequent reconnect
    // attempts so they don't produce extra messages that could confuse the
    // assertion.
    let hits = 0;
    await page.route("**/service/*/events", async (route) => {
      hits++;
      if (hits === 1) {
        await route.fulfill({
          contentType: "text/event-stream",
          body: ": keep-alive\n\n",
        });
      } else {
        // Abort reconnects immediately — explicit, non-leaky, and causes a
        // predictable onerror on the client rather than a dangling async task.
        await route.abort();
      }
    });

    // Serve a minimal wrapper page that embeds the Protospy app in an iframe
    // and records incoming postMessage events.
    await page.route("**/iframe-wrapper", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: `<!DOCTYPE html>
<html>
<head><title>iframe wrapper</title></head>
<body>
  <iframe
    src="${baseURL}/"
    id="app"
    style="width:100%;height:600px;border:none;"
  ></iframe>
  <script>
    window.__messages = [];
    window.addEventListener('message', function(e) {
      window.__messages.push(e.data);
    });
  </script>
</body>
</html>`,
      }),
    );

    await page.goto(`${baseURL}/iframe-wrapper`);

    // Poll the parent page's message log until both coordination events arrive.
    // 15 s accounts for iframe load + app init + SSE handshake; the overall
    // test timeout (30 s) is the hard cap.
    await expect
      .poll(
        () =>
          page.evaluate(
            () => (window as unknown as { __messages: unknown[] }).__messages,
          ),
        { timeout: 15_000 },
      )
      .toEqual(
        expect.arrayContaining([
          { type: "proxy_connected" },
          { type: "proxy_disconnected" },
        ]),
      );

    // Verify ordering: connected must precede disconnected.
    const messages = await page.evaluate(
      () =>
        (window as unknown as { __messages: { type: string }[] }).__messages,
    );
    const connectedIdx = messages.findIndex(
      (m) => m.type === "proxy_connected",
    );
    const disconnectedIdx = messages.findIndex(
      (m) => m.type === "proxy_disconnected",
    );
    expect(connectedIdx).toBeGreaterThanOrEqual(0);
    expect(disconnectedIdx).toBeGreaterThan(connectedIdx);
  });
});
