import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// @tanstack/react-virtual's built-in observeElementRect uses
// ResizeObserver to track scroll-container dimensions. jsdom does not
// provide ResizeObserver, so we polyfill a no-op stub. The actual
// dimension fallback is handled by the custom observeElementRect wrapper
// in EventsView.tsx — this stub just prevents a runtime error.
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver =
    ResizeObserverMock as unknown as typeof ResizeObserver;
}

afterEach(cleanup);
