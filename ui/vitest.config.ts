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
      // Floor ratcheted after PRO-183 HeadersSplit component tests (statements
      // 66.22%, branches 52.24%, functions 55.08%, lines 69.09%) with a ~1% margin.
      thresholds: {
        statements: 66,
        branches: 52,
        functions: 55,
        lines: 69,
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
          unstubGlobals: true,
        },
      },
    ],
  },
});
