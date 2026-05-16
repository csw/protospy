import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@bindings": path.resolve(__dirname, "../bindings"),
      "@ui": path.resolve(__dirname, "src"),
    },
  },
  test: {
    environment: "node",
    passWithNoTests: true,
    exclude: ["e2e/**", "node_modules/**"],
  },
});
