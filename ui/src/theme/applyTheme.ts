export function applyThemeToDOM(isDark: boolean): void {
  document.documentElement.setAttribute(
    "data-theme",
    isDark ? "dark" : "light",
  );
}
