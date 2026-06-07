import { describe, it, expect, afterEach } from "vitest";
import { DEFAULT_THEME, resolveDefaultTheme } from "@ui/theme/theme";

// resolveDefaultTheme reads window.location.search, so drive it through jsdom's
// history API (this is a .test.tsx so it runs under the jsdom project). Reset to
// a bare path after each case so query params don't leak between tests.
afterEach(() => {
  window.history.replaceState({}, "", "/");
});

describe("DEFAULT_THEME", () => {
  it("defaults fresh installs to 'system'", () => {
    expect(DEFAULT_THEME).toBe("system");
  });
});

describe("resolveDefaultTheme", () => {
  it("returns DEFAULT_THEME when no query param is present", () => {
    window.history.replaceState({}, "", "/");
    expect(resolveDefaultTheme()).toBe(DEFAULT_THEME);
  });

  it.each(["light", "dark", "system"] as const)(
    "honours ?defaultTheme=%s",
    (pref) => {
      window.history.replaceState({}, "", `/?defaultTheme=${pref}`);
      expect(resolveDefaultTheme()).toBe(pref);
    },
  );

  it("ignores an unrecognized ?defaultTheme value and falls back to the default", () => {
    window.history.replaceState({}, "", "/?defaultTheme=neon");
    expect(resolveDefaultTheme()).toBe(DEFAULT_THEME);
  });
});
