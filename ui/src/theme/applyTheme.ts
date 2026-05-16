export function applyThemeToDOM(isDark: boolean): void {
  document.documentElement.setAttribute(
    "data-theme",
    isDark ? "dark" : "light",
  );
}

export function resolveInitialDarkMode(): boolean {
  const saved = localStorage.getItem("theme");
  if (saved === "dark") return true;
  if (saved === "light") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function persistDarkMode(isDark: boolean): void {
  localStorage.setItem("theme", isDark ? "dark" : "light");
}
