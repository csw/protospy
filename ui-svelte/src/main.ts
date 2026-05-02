import { mount } from "svelte";
import "./theme/tailwind.css";
import App from "./App.svelte";

// Initialize theme before render to prevent flash
const saved = localStorage.getItem("theme");
const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
document.documentElement.setAttribute(
  "data-theme",
  saved ?? (prefersDark ? "dark" : "light"),
);

mount(App, { target: document.getElementById("app")! });
