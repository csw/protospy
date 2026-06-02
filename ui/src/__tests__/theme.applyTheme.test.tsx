import { describe, it, expect, beforeEach } from "vitest";
import {
  applyThemeToDOM,
  resolveTheme,
  DEFAULT_THEME,
} from "@ui/theme/applyTheme";
import type { ThemePreference } from "@ui/theme/applyTheme";

describe("applyThemeToDOM", () => {
  beforeEach(() => {
    document.documentElement.removeAttribute("data-theme");
  });

  it("sets data-theme='dark' when given 'dark'", () => {
    applyThemeToDOM("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("sets data-theme='light' when given 'light'", () => {
    applyThemeToDOM("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });
});

describe("resolveTheme", () => {
  it("returns 'dark' for preference 'dark'", () => {
    expect(resolveTheme("dark")).toBe("dark");
  });

  it("returns 'light' for preference 'light'", () => {
    expect(resolveTheme("light")).toBe("light");
  });

  it("returns a resolved value for 'system' (dark or light)", () => {
    const result = resolveTheme("system");
    expect(["dark", "light"]).toContain(result);
  });
});

describe("DEFAULT_THEME", () => {
  it("is a valid ThemePreference", () => {
    const valid: ThemePreference[] = ["light", "dark", "system"];
    expect(valid).toContain(DEFAULT_THEME);
  });

  it("defaults to 'system' when VITE_DEFAULT_THEME is unset", () => {
    // In the test environment, VITE_DEFAULT_THEME is not set,
    // so DEFAULT_THEME should fall back to 'system'.
    expect(DEFAULT_THEME).toBe("system");
  });
});
