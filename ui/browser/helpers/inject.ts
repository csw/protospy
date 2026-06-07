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
    // Theme is no longer in the store (next-themes owns the `.dark` class on
    // <html>), so a full store reset can't clobber it — the visual-review
    // "set theme once, inject many scenes" pattern (PRO-253/PRO-256) holds
    // because theme lives outside the store now. Drive theme via
    // `window.__test_theme.setTheme(...)`.
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

/**
 * Theme moved out of the Zustand store with the v2.3 next-themes swap (PRO-345):
 * next-themes owns the `.dark` class on `<html>` and persists the plain
 * preference string under the `theme` localStorage key. Tests drive it through
 * the dev/test-only `window.__test_theme` bridge, not `__test_store`.
 */
/** Wait for the `window.__test_theme` bridge to mount (ThemeTestBridge effect). */
export async function waitForTheme(page: Page) {
  await page.waitForFunction(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    () => (window as any).__test_theme != null,
    { timeout: 10_000 },
  );
}

export async function setTheme(page: Page, value: "light" | "dark" | "system") {
  await waitForTheme(page);
  await page.evaluate((v) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__test_theme.setTheme(v);
  }, value);
  // next-themes applies the class via an effect; wait for the DOM to settle so
  // callers can assert on the resolved `.dark` class immediately after.
  await page.waitForFunction((v) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (window as any).__test_theme?.theme === v;
  }, value);
}

/** The persisted theme preference ("light" | "dark" | "system"). */
export async function getThemePreference(page: Page) {
  return page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (window as any).__test_theme?.theme as string | undefined;
  });
}

/** The resolved theme actually applied to `<html>` ("dark" if `.dark` is set). */
export async function getResolvedTheme(page: Page): Promise<"dark" | "light"> {
  return page.evaluate(() =>
    document.documentElement.classList.contains("dark") ? "dark" : "light",
  );
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
