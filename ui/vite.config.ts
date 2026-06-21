import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { visualizer } from "rollup-plugin-visualizer";
import istanbul from "vite-plugin-istanbul";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

// Opt-in Istanbul coverage for the browser suite (PRO-437). Off by default:
// `pnpm dev`, `pnpm build`, and `pnpm build:test` never instrument. COVERAGE=true
// (set by `pnpm test:browser:coverage`) instruments the modules the Vite dev
// server serves, so `window.__coverage__` is populated.
//
// Coverage runs against the *dev server*, not the preview build the normal suite
// uses, because vite-plugin-istanbul runs `enforce: "post"`: against a production
// build, oxc (@vitejs/plugin-react) has already compiled JSX to `jsx(...)` calls
// before instrumentation, so the `{cond && <X/>}` branches inside a component's
// returned JSX are dropped. In serve mode it instruments per-module with intact
// sourcemaps, so JSX conditionals get real branch counters. This mirrors the
// canonical playwright-test-coverage reference setup.
const coverage = process.env.COVERAGE === "true";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    visualizer(),
    ...(coverage
      ? [
          istanbul({
            include: "src/**/*",
            exclude: ["node_modules", "src/test/**", "src/__tests__/**"],
            extension: [".ts", ".tsx"],
          }),
        ]
      : []),
  ],
  build: {
    chunkSizeWarningLimit: 700,
  },
  resolve: {
    alias: {
      "@bindings": path.resolve(__dirname, "../bindings"),
      "@ui": path.resolve(__dirname, "src"),
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
