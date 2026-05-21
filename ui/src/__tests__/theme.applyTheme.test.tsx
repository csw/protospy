import { describe, it, expect, beforeEach } from "vitest";
import { applyThemeToDOM } from "@ui/theme/applyTheme";

describe("applyThemeToDOM", () => {
  beforeEach(() => {
    document.documentElement.removeAttribute("data-theme");
  });

  it("sets data-theme='dark' on documentElement when isDark is true", () => {
    applyThemeToDOM(true);
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("sets data-theme='light' on documentElement when isDark is false", () => {
    applyThemeToDOM(false);
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });
});
