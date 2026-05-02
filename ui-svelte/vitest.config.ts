import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { svelte } from "@sveltejs/vite-plugin-svelte";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  plugins: [svelte()],
  resolve: {
    alias: {
      "@bindings": path.resolve(__dirname, "../bindings"),
      "@ui": path.resolve(__dirname, "src"),
    },
    conditions: ["browser"],
  },
  test: {
    environment: "jsdom",
    passWithNoTests: true,
  },
});
