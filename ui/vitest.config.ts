import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

const alias = {
  "@bindings": path.resolve(__dirname, "../bindings"),
  "@ui": path.resolve(__dirname, "src"),
};

const thresholds = JSON.parse(
  readFileSync(path.resolve(__dirname, "coverage-thresholds.json"), "utf-8"),
) as { statements: number; branches: number; functions: number; lines: number };

export default defineConfig({
  resolve: { alias },
  test: {
    passWithNoTests: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov", "json-summary"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.d.ts",
        "src/main.tsx",
        "src/App.tsx",
        "src/theme/**",
        "src/components/ui/**",
        "src/vite-env.d.ts",
        "src/test/**",
        "src/llm/fixtures/**",
        "**/__tests__/**",
      ],
      // Thresholds are read from coverage-thresholds.json and ratcheted
      // automatically by the coverage-ratchet workflow (~4% margin below
      // actual). Do not adjust them manually in PRs — see ui/CLAUDE.md.
      // AppShell.tsx (0% unit coverage) is exercised by browser tests.
      thresholds,
    },
    projects: [
      {
        extends: true,
        // WHY this project has its own resolve.alias
        // -----------------------------------------
        // brotli-dec-wasm's default init loads its WASM binary via
        //   fetch(new URL('./pkg/brotli_dec_wasm_bg.wasm', import.meta.url))
        // Node 22's fetch() does not support file:// URLs, so that fails.
        //
        // We alias 'brotli-dec-wasm' to a thin Node-compatible wrapper
        // (src/test/brotli-dec-wasm-node.ts) that uses readFileSync() +
        // initSync() instead. The alias is scoped to THIS project so that:
        //  - Vite (browser production build): uses the real package — Chromium
        //    supports fetch(file://...) via the bundled asset URL that Vite
        //    generates for the new URL(..., import.meta.url) pattern.
        //  - Playwright browser tests: also use the real package (no alias).
        //  - jsdom Vitest project: doesn't import brotli-dec-wasm directly,
        //    so the alias is irrelevant there — but keeping it off jsdom avoids
        //    any accidental coupling.
        //
        // The wrapper exports the same API shape as the real package so
        // decode.ts is exercising the actual brotli-dec-wasm WASM binary;
        // only the initialization path differs.
        resolve: {
          alias: [
            // Path aliases shared with root config. We spell them out
            // explicitly here because specifying resolve at the project level
            // overrides (rather than merges with) the root-level resolve in
            // some Vite versions, and we don't want to silently drop @bindings
            // or @ui.
            {
              find: "@bindings",
              replacement: path.resolve(__dirname, "../bindings"),
            },
            { find: "@ui", replacement: path.resolve(__dirname, "src") },
            // Redirect 'brotli-dec-wasm' to the Node-compatible wrapper.
            //
            // IMPORTANT: use a regex anchored with $ so the alias only matches
            // the exact specifier 'brotli-dec-wasm' and NOT subpaths such as
            // 'brotli-dec-wasm/web'. Vite's string-key alias matching follows
            // the rule:  id === key  ||  id.startsWith(key + '/'),  which means
            // a plain string key would also capture subpath imports and redirect
            // them to a broken path. The regex ^brotli-dec-wasm$ prevents that.
            {
              find: /^brotli-dec-wasm$/,
              replacement: path.resolve(
                __dirname,
                "src/test/brotli-dec-wasm-node.ts",
              ),
            },
          ],
        },
        test: {
          name: "node",
          environment: "node",
          include: ["src/__tests__/**/*.test.ts"],
          typecheck: {
            tsconfig: "./tsconfig.test.json",
          },
        },
      },
      {
        extends: true,
        test: {
          name: "jsdom",
          environment: "jsdom",
          include: ["src/__tests__/**/*.test.tsx"],
          setupFiles: ["./src/test/setup.ts"],
          unstubGlobals: true,
        },
      },
    ],
  },
});
