/**
 * Theme preference type + default resolution.
 *
 * v2.3 owns theme through **next-themes** (`.dark` class on `<html>`, persisted
 * under the `theme` localStorage key). This module carries only the bits that
 * aren't next-themes': the three-state preference type and the fresh-install
 * default, which the pre-React bootstrap IIFE in `index.html` must agree with.
 *
 * The retired `applyTheme.ts` (Zustand + `[data-theme=dark]` strategy) is gone;
 * next-themes is the sole writer of the theme class on `<html>`.
 */

/** The three-state persisted theme preference. */
export type ThemePreference = "light" | "dark" | "system";

/** Default for fresh installs (no persisted preference). */
export const DEFAULT_THEME: ThemePreference = "system";

const isPreference = (v: unknown): v is ThemePreference =>
  v === "light" || v === "dark" || v === "system";

/**
 * Resolve the default theme for the next-themes `ThemeProvider`.
 *
 * Honours a `?defaultTheme=` query parameter (the demo site forces dark this
 * way without a custom build), falling back to {@link DEFAULT_THEME}. Must match
 * the bootstrap IIFE in `index.html`, which reads the same param in the same way.
 */
export function resolveDefaultTheme(): ThemePreference {
  if (typeof window !== "undefined") {
    const qp = new URLSearchParams(window.location.search).get("defaultTheme");
    if (isPreference(qp)) return qp;
  }
  return DEFAULT_THEME;
}
