import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/inter";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "@fontsource/jetbrains-mono/600.css";
import "@fontsource/jetbrains-mono/700.css";
import "./theme/tailwind.css";
import { applyThemeToDOM } from "./theme/applyTheme";
import "./state/store";
import App from "./App.tsx";

// Apply theme before first paint to prevent flash. The persist middleware
// will hydrate the store asynchronously, but the DOM attribute must be set
// synchronously from the raw localStorage value.
try {
  const raw = localStorage.getItem("protospy-ui-prefs");
  if (raw) {
    const { state } = JSON.parse(raw);
    if (state?.darkMode) applyThemeToDOM(true);
  }
} catch {
  // corrupt or missing — fall through to light default
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
