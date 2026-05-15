import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  applyThemeToDOM,
  resolveInitialDarkMode,
  persistDarkMode,
} from "@ui/theme/applyTheme";

describe("applyTheme", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("applyThemeToDOM", () => {
    it("sets data-theme='dark' on documentElement when isDark is true", () => {
      applyThemeToDOM(true);
      expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    });

    it("sets data-theme='light' on documentElement when isDark is false", () => {
      applyThemeToDOM(false);
      expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    });
  });

  describe("resolveInitialDarkMode", () => {
    it("returns true when localStorage theme is 'dark' regardless of matchMedia", () => {
      localStorage.setItem("theme", "dark");
      vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: false }));
      expect(resolveInitialDarkMode()).toBe(true);
    });

    it("returns false when localStorage theme is 'light' regardless of matchMedia", () => {
      localStorage.setItem("theme", "light");
      vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: true }));
      expect(resolveInitialDarkMode()).toBe(false);
    });

    it("returns true when localStorage empty and matchMedia matches dark", () => {
      vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: true }));
      expect(resolveInitialDarkMode()).toBe(true);
    });

    it("returns false when localStorage empty and matchMedia does not match dark", () => {
      vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: false }));
      expect(resolveInitialDarkMode()).toBe(false);
    });

    it("falls through to matchMedia when localStorage theme is an unrecognized value", () => {
      localStorage.setItem("theme", "garbage");
      const matchMediaMock = vi.fn().mockReturnValue({ matches: true });
      vi.stubGlobal("matchMedia", matchMediaMock);
      expect(resolveInitialDarkMode()).toBe(true);
      expect(matchMediaMock).toHaveBeenCalledWith(
        "(prefers-color-scheme: dark)",
      );
    });
  });

  describe("persistDarkMode", () => {
    it("writes 'dark' to localStorage under 'theme' when isDark is true", () => {
      persistDarkMode(true);
      expect(localStorage.getItem("theme")).toBe("dark");
    });

    it("writes 'light' to localStorage under 'theme' when isDark is false", () => {
      persistDarkMode(false);
      expect(localStorage.getItem("theme")).toBe("light");
    });
  });
});
