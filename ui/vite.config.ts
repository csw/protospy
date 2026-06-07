import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@bindings": path.resolve(__dirname, "../bindings"),
      "@ui": path.resolve(__dirname, "src"),
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    proxy: {
      "/info": "http://localhost:3100",
      "/service": "http://localhost:3100",
    },
    fs: {
      // Allow serving files from the bindings/ directory one level up
      allow: [".."],
    },
  },
});
