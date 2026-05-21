import type { Page } from "@playwright/test";

export async function waitForStore(page: Page) {
  await page.waitForFunction(
    () => {
      const store = (window as Record<string, unknown>).__test_store;
      if (store == null) return false;
      // Wait for persist middleware hydration to complete
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (store as any).persist?.hasHydrated?.() ?? true;
    },
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

export async function setStoreProtocol(
  page: Page,
  protocol: "Elasticsearch" | "OpenSearch" | null,
) {
  await page.evaluate((p) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const store = (window as any).__test_store;
    store.getState().setProtocol(p);
  }, protocol);
}
