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

// Fixture-matrix harness (PRO-234). Mirrors the window.__test_store exposure in
// state/store.ts: present in dev, and in test-mode preview builds via the
// VITE_EXPOSE_TEST_HOOKS flag from .env.test (see the `build:test` script). A
// plain production build sets neither, so the dynamic import is
// dead-code-eliminated and the scene definitions + their test fixtures never
// reach the prod bundle.
if (import.meta.env.DEV || import.meta.env.VITE_EXPOSE_TEST_HOOKS === "true") {
  void import("./test/scenes").then(({ installSceneHarness }) => {
    installSceneHarness(useStore);
  });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
