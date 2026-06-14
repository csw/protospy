import type { Page, ConsoleMessage } from "@playwright/test";

/**
 * Attach console-error and pageerror listeners to `page` and return the
 * accumulated list. Call before the action under test so no errors are missed.
 */
export function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg: ConsoleMessage) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(err.message));
  return errors;
}
