/**
 * Browser tests for the screenshot-capture wait helper
 * (`scripts/screenshot-helpers.ts`).
 *
 * Exercises the REAL helper against the REAL DOM: it must block while a loading
 * skeleton is present and resolve only once the body content has rendered. This
 * is the behaviour the screenshot pipelines (take-screenshots, take-bestiary)
 * depend on to avoid capturing half-decoded body panes (PRO-429). The held
 * Worker harness (mirrored from body-json-worker.spec.ts) keeps the skeleton
 * deterministically on screen so the wait is tested, not raced.
 */

import { test, expect } from "@playwright/test";
import { waitForStore, resetStore, injectExchanges } from "./helpers/inject";
import { makeGetRequest, makeResponse } from "./fixtures/exchanges";
import { waitForContentSettled } from "../scripts/screenshot-helpers";

test.beforeEach(async ({ page }) => {
  await page.route("**/info", (route) =>
    route.fulfill({ json: { services: [{ name: "test-backend" }] } }),
  );
  await page.route("**/service/test-backend/events", (route) =>
    route.fulfill({ contentType: "text/event-stream", body: "" }),
  );
});

test.describe("waitForContentSettled — content already rendered", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await waitForStore(page);
    await resetStore(page);
  });

  test("resolves once the body has rendered", async ({ page }) => {
    await injectExchanges(page, [
      makeGetRequest(1, "/api/items"),
      makeResponse(1, "200 OK", JSON.stringify({ items: [1, 2, 3] })),
    ]);
    await page.getByText("/api/items").first().click();

    // The helper must hold until the JSON tree replaces the skeleton.
    await waitForContentSettled(page);

    await expect(page.getByLabel("JSON viewer")).toBeVisible();
    await expect(page.getByTestId("body-skeleton")).toHaveCount(0);
  });

  test("resolves immediately when nothing is loading", async ({ page }) => {
    // No exchange selected — no body pane, so no skeleton ever mounts.
    await waitForContentSettled(page, { timeoutMs: 2_000 });
    await expect(page.getByTestId("body-skeleton")).toHaveCount(0);
  });
});

test.describe("waitForContentSettled — blocks on a held skeleton", () => {
  test.beforeEach(async ({ page }) => {
    // Intercept the JSON-parse Worker so its result can be held, keeping the
    // body skeleton deterministically on screen (see body-json-worker.spec.ts).
    await page.addInitScript(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const win = window as any;
      const OriginalWorker = win.Worker as typeof Worker;
      let responseHeld = false;
      const queuedDeliveries: Array<() => void> = [];

      win.__holdJsonWorkerResponse = function () {
        responseHeld = true;
      };
      win.__releaseJsonWorkerResponse = function () {
        responseHeld = false;
        for (const deliver of queuedDeliveries) deliver();
        queuedDeliveries.length = 0;
      };

      win.Worker = function (url: string | URL, opts?: WorkerOptions): Worker {
        const worker: Worker = new OriginalWorker(url as string, opts);
        if (String(url).includes("json-parse")) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const w = worker as any;
          const orig = worker.addEventListener.bind(worker);
          w.addEventListener = function (
            type: string,
            handler: EventListenerOrEventListenerObject,
            options?: AddEventListenerOptions | boolean,
          ): void {
            if (type === "message") {
              orig(
                "message",
                (event: Event) => {
                  if (!responseHeld) {
                    (handler as EventListener)(event);
                  } else {
                    queuedDeliveries.push(() =>
                      (handler as EventListener)(event),
                    );
                  }
                },
                options,
              );
            } else {
              orig(type, handler, options);
            }
          };
        }
        return worker;
      };
      win.Worker.prototype = OriginalWorker.prototype;
    });

    await page.goto("/");
    await page.reload();
    await waitForStore(page);
    await resetStore(page);
  });

  test("does not resolve while the skeleton is held, then resolves on release", async ({
    page,
  }) => {
    await injectExchanges(page, [
      makeGetRequest(1, "/api/items"),
      makeResponse(1, "200 OK", JSON.stringify({ items: [1, 2, 3] })),
    ]);

    // Hold the Worker before selecting so the skeleton is guaranteed visible.
    await page.evaluate(() =>
      (
        window as unknown as { __holdJsonWorkerResponse(): void }
      ).__holdJsonWorkerResponse(),
    );
    await page.getByText("/api/items").first().click();
    await expect(page.getByTestId("body-skeleton")).toBeVisible({
      timeout: 5_000,
    });

    // Kick off the wait; track resolution without awaiting yet.
    let settled = false;
    const pending = waitForContentSettled(page).then(() => {
      settled = true;
    });

    // While the skeleton is held it must still be present and the wait pending.
    await expect(page.getByTestId("body-skeleton")).toBeVisible();
    expect(settled).toBe(false);

    // Release the Worker — content renders, skeleton detaches, wait resolves.
    await page.evaluate(() =>
      (
        window as unknown as { __releaseJsonWorkerResponse(): void }
      ).__releaseJsonWorkerResponse(),
    );
    await pending;

    expect(settled).toBe(true);
    await expect(page.getByLabel("JSON viewer")).toBeVisible();
    await expect(page.getByTestId("body-skeleton")).toHaveCount(0);
  });
});
