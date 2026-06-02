/**
 * Theme utilities — pure functions for resolving and applying the theme.
 *
 * ## Theme ownership contract
 *
 * There are exactly two writers of `<html data-theme>`:
 *
 * 1. **Bootstrap IIFE** (`index.html`): runs before React, reads the
 *    persisted `protospy-ui-prefs` key, resolves `'system'` via
 *    `matchMedia`, and sets `data-theme` synchronously so the first
 *    paint is already themed. This is the only pre-React DOM writer.
 *
 * 2. **Runtime subscriber** (`state/store.ts`): a single
 *    `subscribeWithSelector` subscription on the `theme` slice fires
 *    whenever the preference changes (and once on hydration via
 *    `fireImmediately`). It calls `applyThemeToDOM(resolveTheme(theme))`
 *    to reconcile store -> DOM. This is the only runtime DOM writer.
 *
 * No other code path — not the theme action, not `onRehydrateStorage` —
 * touches `data-theme`.
 */

/** The three-state persisted theme preference. */
export type ThemePreference = "light" | "dark" | "system";

/**
 * The default theme for fresh installs (no persisted preference).
 *
 * Defaults to `'system'` (follow OS). Overridable at runtime via a
 * `?defaultTheme=` query parameter — the demo site uses this to force
 * dark without a custom build.
 *
 * Must agree with the bootstrap IIFE in `index.html`, which reads from
 * the same sources in the same order.
 */
export const DEFAULT_THEME: ThemePreference = (() => {
  const valid = (v: unknown): v is ThemePreference =>
    v === "light" || v === "dark" || v === "system";

  // Runtime query-parameter override (e.g. ?defaultTheme=dark)
  if (typeof window !== "undefined") {
    const qp = new URLSearchParams(window.location.search).get("defaultTheme");
    if (valid(qp)) return qp;
  }

  return "system";
})();

/**
 * Resolve a theme preference to the concrete `'dark' | 'light'` value
 * that should be applied to the DOM.
 *
 * For `'system'`, queries `matchMedia('(prefers-color-scheme: dark)')`.
 * Pure aside from the `matchMedia` call (which is unavoidable).
 */
export function resolveTheme(pref: ThemePreference): "dark" | "light" {
  if (pref === "light" || pref === "dark") return pref;
  // 'system': follow OS preference
  if (typeof window !== "undefined" && window.matchMedia) {
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }
  // SSR / node fallback
  return "dark";
}

/**
 * Apply a resolved theme to the DOM. Only called by the bootstrap IIFE
 * and the runtime subscriber — see the ownership contract above.
 */
export function applyThemeToDOM(resolved: "dark" | "light"): void {
  document.documentElement.setAttribute("data-theme", resolved);
}
