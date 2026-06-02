import type { ReactElement, ReactNode } from "react";
import { render, type RenderOptions } from "@testing-library/react";
import { TooltipProvider } from "@ui/components/ui/tooltip";

/**
 * App-level providers that component tests need. Mirrors the provider
 * tree in App.tsx so components render in the same context as production.
 */
function Providers({ children }: { children: ReactNode }) {
  return <TooltipProvider>{children}</TooltipProvider>;
}

/**
 * Custom render that wraps the component in app-level providers.
 *
 * Drop-in replacement for `@testing-library/react`'s `render` — pass
 * the same options, get the same return value. The wrapper can still be
 * overridden per-test via `options.wrapper` if needed.
 */
function renderWithProviders(
  ui: ReactElement,
  options?: Omit<RenderOptions, "wrapper">,
) {
  return render(ui, { wrapper: Providers, ...options });
}

export { renderWithProviders as render };
