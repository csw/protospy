import js from "@eslint/js";
import tseslint from "typescript-eslint";
import sveltePlugin from "eslint-plugin-svelte";
import prettierConfig from "eslint-config-prettier";
import globals from "globals";

export default tseslint.config(
  {
    ignores: ["dist/**", "dist-ssr/**", "node_modules/**", ".svelte-kit/**"],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  ...sveltePlugin.configs["flat/recommended"],
  {
    files: ["**/*.svelte"],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
      },
    },
  },
  {
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
  },
  prettierConfig,
  ...sveltePlugin.configs["flat/prettier"],
  {
    files: ["**/*.svelte.ts"],
    languageOptions: {
      parser: tseslint.parser,
    },
  },
);
