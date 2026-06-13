import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/inter";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "@fontsource/jetbrains-mono/600.css";
import "@fontsource/jetbrains-mono/700.css";
import "./app/globals.css";
import { useStore } from "./state/store";
import App from "./App.tsx";

// Test hooks (scene harness, JsonTreeViewer harness) are present in dev and in
// test-mode preview builds via the VITE_EXPOSE_TEST_HOOKS flag from .env.test
// (see the `build:test` script); a plain production build sets neither, so the
// dynamic imports below are dead-code-eliminated and their definitions + test
// fixtures never reach the prod bundle.
const TEST_HOOKS_ENABLED =
  import.meta.env.DEV || import.meta.env.VITE_EXPOSE_TEST_HOOKS === "true";

const rootEl = document.getElementById("root")!;

if (
  TEST_HOOKS_ENABLED &&
  window.location.hash.startsWith("#json-tree-harness")
) {
  // Dev/test-only standalone harness for JsonTreeViewer (PRO-397/PRO-398,
  // phases 1a–1b). Lets visual review and the browser suite drive the
  // component with representative fixtures in isolation.
  void import("./components/json-tree/harness").then(({ JsonTreeHarness }) => {
    createRoot(rootEl).render(
      <StrictMode>
        <JsonTreeHarness />
      </StrictMode>,
    );
  });
} else {
  // Fixture-matrix harness (PRO-234). Mirrors the window.__test_store exposure
  // in state/store.ts.
  if (TEST_HOOKS_ENABLED) {
    void import("./test/scenes").then(({ installSceneHarness }) => {
      installSceneHarness(useStore);
    });
  }

  createRoot(rootEl).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
