import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/inter";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "@fontsource/jetbrains-mono/600.css";
import "@fontsource/jetbrains-mono/700.css";
import "./theme/tailwind.css";
import { useStore } from "./state/store";
import App from "./App.tsx";

// Dev-only fixture-matrix harness (PRO-234). Mirrors the window.__test_store
// exposure in state/store.ts. The dynamic import is dead-code-eliminated from
// production builds (import.meta.env.DEV is statically false there), so the
// scene definitions and their test fixtures never reach the prod bundle.
if (import.meta.env.DEV) {
  void import("./test/scenes").then(({ installSceneHarness }) => {
    installSceneHarness(useStore);
  });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
