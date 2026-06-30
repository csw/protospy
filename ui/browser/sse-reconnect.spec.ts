import { test, expect } from "./fixtures/coverage";
import { waitForStore } from "./helpers/inject";

// Drives the connection-status pill through its full lifecycle by using
// page.route to control when the SSE stream opens, closes, and reopens.
//
// Playwright's `route.fulfill` is atomic — the response delivers and the
// connection closes in a single tick, so the brief "open" window between
// open/close cycles is too short for `expect.poll` to catch reliably. The
// test installs a store subscriber via `addInitScript` (so it hooks
// `window.__test_store` the moment the app assigns it, *before* the SSE
// subscription fires) and asserts on the recorded transition sequence.
test.describe("SSE reconnection", () => {
  test("status pill transitions through connecting, open, reconnecting, open", async ({
    page,
  }) => {
    await page.route("**/info", (route) =>
      route.fulfill({ json: { services: [{ name: "test-backend" }] } }),
    );

    let hits = 0;
    // Gate the second connection so the "reconnecting" state stays visible
    // long enough to observe and assert without a race against the retry.
    let releaseSecond: (() => void) | null = null;
    const secondReady = new Promise<void>((resolve) => {
      releaseSecond = resolve;
    });

    await page.route("**/service/*/events", async (route) => {
      hits++;
      if (hits === 1) {
        // First hit: deliver fast-retry header + keep-alive comment, then
        // close. EventSource fires onopen (→ "open") then onerror once the
        // body ends (→ "reconnecting"). `retry: 50` shrinks the default ~3s
        // reconnect window so the next request lands quickly.
        await route.fulfill({
          contentType: "text/event-stream",
          body: "retry: 50\n\n: keep-alive\n\n",
        });
        return;
      }
      if (hits === 2) {
        // Second hit: park until the test releases it. While parked the
        // EventSource sits in CONNECTING and the store stays in
        // "reconnecting" — giving us a stable state to assert on.
        await secondReady;
        await route.fulfill({
          contentType: "text/event-stream",
          body: "retry: 99999999\n\n: keep-alive\n\n",
        });
        return;
      }
      // Any further reconnect attempts after the second close: park forever.
      // The store's last transition lands in "reconnecting" once the second
      // body closes; that's the steady state we expect to observe.
      await new Promise<void>(() => {});
    });

    // Hook `__test_store` BEFORE the app assigns it, so the subscriber is
    // attached before the SSE subscription kicks off and we don't miss the
    // initial connecting → open → reconnecting transitions.
    await page.addInitScript(() => {
      type Store = {
        getState(): { connection: string };
        subscribe(fn: (s: { connection: string }) => void): () => void;
      };
      const w = window as unknown as {
        __test_store?: Store;
        __conn_log: string[];
      };
      w.__conn_log = [];
      let real: Store | undefined;
      Object.defineProperty(window, "__test_store", {
        configurable: true,
        get() {
          return real;
        },
        set(v: Store) {
          real = v;
          if (!v) return;
          const initial = v.getState().connection;
          w.__conn_log.push(initial);
          let last = initial;
          v.subscribe((s) => {
            if (s.connection !== last) {
              last = s.connection;
              w.__conn_log.push(s.connection);
            }
          });
        },
      });
    });

    await page.goto("/");
    await waitForStore(page);

    // Wait for the recorded log to contain at least 4 entries: the initial
    // connecting plus the open → reconnecting → open cycle. The fourth
    // entry materialises once we release the parked second connection and
    // its onopen fires.
    const getLog = () =>
      page.evaluate(
        () => (window as unknown as { __conn_log: string[] }).__conn_log,
      );

    // First, wait until the store has settled in "reconnecting" with the
    // second request parked.
    await expect
      .poll(async () => (await getLog()).at(-1), { timeout: 5000 })
      .toBe("reconnecting");
    // The scaffold maps the reconnecting socket state onto the connecting
    // connection atom, while the toast preserves the precise reconnecting copy.
    await expect(
      page.getByRole("status", { name: "connecting…" }).first(),
    ).toBeVisible();

    // The open → reconnecting transition fires the connection-lost toast
    // through the real `sonner` host (PRO-366). First connect is silent, so
    // this is the first toast to appear.
    await expect(
      page.getByText("Connection lost — reconnecting…"),
    ).toBeVisible();

    // Release the parked second connection — onopen will fire briefly
    // before the body closes again.
    releaseSecond!();

    // Wait until "open" appears for the second time in the log.
    await expect
      .poll(
        async () => {
          const log = await getLog();
          let count = 0;
          for (const s of log) if (s === "open") count++;
          return count;
        },
        { timeout: 5000 },
      )
      .toBeGreaterThanOrEqual(2);

    // The recovery toast ("Reconnected") is deliberately NOT asserted here: it
    // shares a stable sonner id with the connection-lost toast (so a flapping
    // link updates one toast in place rather than stacking, PRO-366), and this
    // harness cannot hold the second connection open — `route.fulfill` is
    // atomic, so it closes again in the same tick the recovery toast fires,
    // which immediately replaces "Reconnected" with "Connection lost" again.
    // The recovery emission (reconnecting → open ⇒ success) is unit-covered in
    // `src/__tests__/lib.toast.test.tsx`; the real-path toast wiring is proven
    // by the "Connection lost" assertion above.
    const transitions = await getLog();

    // Sequence: starts at "connecting", reaches "open", drops to
    // "reconnecting" when the first body closes, then returns to "open"
    // when the second request is released.
    expect(transitions[0]).toBe("connecting");
    const firstOpen = transitions.indexOf("open");
    const firstReconnecting = transitions.indexOf("reconnecting");
    const secondOpen = transitions.indexOf("open", firstReconnecting);
    expect(firstOpen).toBeGreaterThan(-1);
    expect(firstReconnecting).toBeGreaterThan(firstOpen);
    expect(secondOpen).toBeGreaterThan(firstReconnecting);

    expect(hits).toBeGreaterThanOrEqual(2);
  });
});
