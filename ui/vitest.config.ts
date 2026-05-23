import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

const alias = {
  "@bindings": path.resolve(__dirname, "../bindings"),
  "@ui": path.resolve(__dirname, "src"),
};

export default defineConfig({
  resolve: { alias },
  test: {
    passWithNoTests: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
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
      // Floor ratcheted after PRO-120 relative timestamps (statements 63.88%,
      // branches 48.43%, functions 52.27%, lines 66.53%) with a ~2% margin.
      // Note: the measurements in the PR were slightly optimistic (thresholds
      // were set from an earlier snapshot); these are calibrated from the
      // merged state.
      thresholds: {
        statements: 62,
        branches: 47,
        functions: 51,
        lines: 65,
      },
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
        },
      },
    ],
  },
});
