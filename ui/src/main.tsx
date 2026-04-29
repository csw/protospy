import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./theme/tailwind.css";
import App from "./App.tsx";

// Initialize theme before render to prevent flash
const saved = localStorage.getItem("theme");
const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
document.documentElement.setAttribute(
  "data-theme",
  saved ?? (prefersDark ? "dark" : "light"),
);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
