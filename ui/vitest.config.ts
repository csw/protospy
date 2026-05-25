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
        test: {
          name: "node",
          environment: "node",
          include: ["src/__tests__/**/*.test.ts"],
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
