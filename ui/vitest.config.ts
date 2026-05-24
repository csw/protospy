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
      // Floor ratcheted after PRO-129 HeadersPane + headers helpers (statements
      // 66.08%, branches 52.1%, functions 54.77%, lines 68.94%) with a ~1% margin.
      thresholds: {
        statements: 65,
        branches: 51,
        functions: 53,
        lines: 67,
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
