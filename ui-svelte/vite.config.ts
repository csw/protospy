import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  plugins: [svelte(), tailwindcss()],
  resolve: {
    alias: {
      "@bindings": path.resolve(__dirname, "../bindings"),
      "@ui": path.resolve(__dirname, "src"),
    },
  },
  server: {
    port: 5174,
    proxy: {
      "/info": {
        target: "http://localhost:3100",
        changeOrigin: false,
        compress: false,
      },
      "/service": {
        target: "http://localhost:3100",
        changeOrigin: false,
        compress: false,
      },
    },
    fs: {
      // Allow serving files from the bindings/ directory one level up
      allow: [".."],
    },
  },
});
