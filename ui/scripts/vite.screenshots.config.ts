/**
 * Vite config for the `just screenshots` pipeline.
 *
 * Identical to the root vite.config.ts except the dev-proxy targets the
 * screenshots-specific protospy web port (6221) instead of the default 3100,
 * so the screenshots recipe doesn't conflict with a running dev environment.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const UI_DIR = path.resolve(__dirname, "..");

export default defineConfig({
  // Set the Vite project root to ui/ so index.html and public/ resolve correctly
  // even though this config file lives in ui/scripts/.
  root: UI_DIR,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@bindings": path.resolve(__dirname, "../../bindings"),
      "@ui": path.resolve(__dirname, "../src"),
    },
  },
  server: {
    proxy: {
      "/info": "http://localhost:6221",
      "/service": "http://localhost:6221",
    },
    // Allow serving files from the repo root (for bindings/)
    fs: { allow: ["../.."] },
  },
});
