import { useEffect } from "react";
import { ThemeProvider, useTheme } from "next-themes";
import { AppShell } from "./components/protospy/app-shell";
import type { Exchange } from "./state/reducer";
import type { Protocol } from "@bindings/Protocol";
import { BodySplit } from "./components/BodySplit";
import { EmptyState } from "./components/ui/EmptyState";
import type { MsearchView } from "./components/protospy/inspector";
import { TooltipProvider } from "./components/ui/tooltip";
import { Toaster } from "./components/ui/sonner";
import { resolveDefaultTheme } from "./theme/theme";

// Resolved once at module load: it reads window.location.search, which is fixed
// for the page lifetime, and ThemeProvider only consumes it on initial mount.
const DEFAULT_NEXT_THEME = resolveDefaultTheme();

// Gate for the test-only theme bridge — true in dev and test-mode preview
// builds, false (and tree-shaken) in prod. Mirrors the `__test_store` gate.
const TEST_HOOKS_ENABLED =
  import.meta.env.DEV || import.meta.env.VITE_EXPOSE_TEST_HOOKS === "true";

/**
 * Dev/test-only bridge exposing next-themes' control to the Playwright harness
 * and component tests. Theme moved out of the Zustand store with the v2.3
 * next-themes swap, so `window.__test_store` no longer carries it; tests drive
 * theme through `window.__test_theme` instead. Rendered only when
 * `TEST_HOOKS_ENABLED` (see its gate at the call site), so its effect never runs
 * in prod.
 */
function ThemeTestBridge() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  useEffect(() => {
    (window as unknown as Record<string, unknown>).__test_theme = {
      theme,
      resolvedTheme,
      setTheme,
    };
  }, [theme, resolvedTheme, setTheme]);
  return null;
}

function App() {
  const renderBodySplit = (exchange: Exchange, protocol: Protocol | null) => (
    <BodySplit exchange={exchange} protocol={protocol} />
  );
  const renderMsearch = (
    exchange: Exchange,
    protocol: Protocol | null,
    view: MsearchView,
  ) =>
    view === "raw" ? (
      <BodySplit exchange={exchange} protocol={protocol} />
    ) : (
      <EmptyState textSize="sm">
        Paired request view is not yet available
      </EmptyState>
    );

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme={DEFAULT_NEXT_THEME}
      enableSystem
      storageKey="theme"
      disableTransitionOnChange
    >
      <TooltipProvider>
        <AppShell
          renderBodySplit={renderBodySplit}
          renderMsearch={renderMsearch}
        />
        <Toaster />
        {TEST_HOOKS_ENABLED && <ThemeTestBridge />}
      </TooltipProvider>
    </ThemeProvider>
  );
}

export default App;
