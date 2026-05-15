import type { Page } from "@playwright/test";

export async function waitForStore(page: Page) {
  await page.waitForFunction(
    () => (window as Record<string, unknown>).__test_store != null,
    { timeout: 10_000 },
  );
}

export async function injectExchanges(
  page: Page,
  messages: Record<string, unknown>[],
) {
  await page.evaluate((msgs) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const store = (window as any).__test_store;
    const { applyEvent } = store.getState();
    for (const msg of msgs) applyEvent(msg);
  }, messages);
}

export async function resetStore(page: Page) {
  await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const store = (window as any).__test_store;
    const initial = store.getInitialState();
    store.setState(initial, true);
  });
}

export async function getStoreState(page: Page, key: string) {
  return page.evaluate((k) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const store = (window as any).__test_store;
    return store.getState()[k];
  }, key);
}
