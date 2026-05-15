import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/inter";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "@fontsource/jetbrains-mono/600.css";
import "@fontsource/jetbrains-mono/700.css";
import "./theme/tailwind.css";
import { applyThemeToDOM, resolveInitialDarkMode } from "./theme/applyTheme";
import { useStore } from "./state/store";
import App from "./App.tsx";

// Apply theme before render to prevent flash, and sync the store so any
// component reading darkMode on first paint sees the resolved value.
const isDark = resolveInitialDarkMode();
applyThemeToDOM(isDark);
useStore.setState({ darkMode: isDark });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
