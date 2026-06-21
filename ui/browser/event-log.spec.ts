import { test, expect } from "@playwright/test";
import { waitForStore } from "./helpers/inject";
import { applyScene, waitForSceneHarness } from "./helpers/scenes";

// Production-fidelity coverage for the SSE EventLog, which jsdom component
// tests can't fully exercise: real DOM validation of button nesting and real
// hit-testing of the expand toggle. The `stream-anthropic` scene renders the
// event log (events mode is the default) with a long `message_start` row whose
// data exceeds the truncation threshold, so the expand toggle is present.
//
// Regression: PRO-440 — the row used to be a <button> and the expand toggle a
// nested <button>, which is invalid DOM and made React log a validateDOMNesting
// error whenever these scenes rendered.

const consoleErrors: string[] = [];
const pageErrors: string[] = [];

test.beforeEach(async ({ page }) => {
  consoleErrors.length = 0;
  pageErrors.length = 0;
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => pageErrors.push(String(err)));

  await page.route("**/info", (route) =>
    route.fulfill({ json: { services: [] } }),
  );
  await page.goto("/");
  await waitForStore(page);
  await waitForSceneHarness(page);
  await applyScene(page, "stream-anthropic");
});

test("renders the event log with no nested <button> and no console error", async ({
  page,
}) => {
  // The event-type labels confirm the EventLog rendered.
  await expect(page.getByText("message_start").first()).toBeVisible();

  const nestedButtons = await page.evaluate(
    () =>
      Array.from(document.querySelectorAll("button")).filter((b) =>
        b.querySelector("button"),
      ).length,
  );
  expect(nestedButtons).toBe(0);

  expect(pageErrors, "uncaught page errors").toEqual([]);
  expect(consoleErrors, "console errors").toEqual([]);
});

test("expand toggle reveals the full event data via real hit-testing", async ({
  page,
}) => {
  const expand = page
    .getByRole("button", { name: "Expand event data" })
    .first();
  await expect(expand).toBeVisible();
  await expect(expand).toHaveAttribute("aria-expanded", "false");

  // The long message_start payload is truncated with an ellipsis until expanded.
  await expect(page.getByText("…", { exact: false }).first()).toBeVisible();

  await expand.click();

  const collapse = page
    .getByRole("button", { name: "Collapse event data" })
    .first();
  await expect(collapse).toBeVisible();
  await expect(collapse).toHaveAttribute("aria-expanded", "true");
  // The full payload includes the model id, which is hidden while truncated.
  await expect(
    page.getByText("claude-3-5-sonnet-20241022", { exact: false }).first(),
  ).toBeVisible();

  await collapse.click();
  await expect(
    page.getByRole("button", { name: "Expand event data" }).first(),
  ).toHaveAttribute("aria-expanded", "false");

  expect(pageErrors, "uncaught page errors").toEqual([]);
  expect(consoleErrors, "console errors").toEqual([]);
});
