import { useEffect } from "react";
import { ThemeProvider, useTheme } from "next-themes";
import { AppShell } from "./components/AppShell";
import { TooltipProvider } from "./components/ui/tooltip";
import { Toaster } from "./components/ui/sonner";
import { resolveDefaultTheme } from "./theme/theme";

/**
 * Dev/test-only bridge exposing next-themes' control to the Playwright harness
 * and component tests. Theme moved out of the Zustand store with the v2.3
 * next-themes swap, so `window.__test_store` no longer carries it; tests drive
 * theme through `window.__test_theme` instead. Gated like `__test_store`:
 * present in dev and test-mode preview builds, tree-shaken from prod.
 */
function ThemeTestBridge() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  useEffect(() => {
    if (
      import.meta.env.DEV ||
      import.meta.env.VITE_EXPOSE_TEST_HOOKS === "true"
    ) {
      (window as unknown as Record<string, unknown>).__test_theme = {
        theme,
        resolvedTheme,
        setTheme,
      };
    }
  }, [theme, resolvedTheme, setTheme]);
  return null;
}

function App() {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme={resolveDefaultTheme()}
      enableSystem
      storageKey="theme"
      disableTransitionOnChange
    >
      <TooltipProvider>
        <AppShell />
        <Toaster />
        <ThemeTestBridge />
      </TooltipProvider>
    </ThemeProvider>
  );
}

export default App;
