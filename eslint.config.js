import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/dist/**", "**/.next/**", "**/node_modules/**", "**/coverage/**", "**/next-env.d.ts"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { languageOptions: { globals: { ...globals.node } } },
  {
    // The screenshot script runs small functions inside the browser page.
    files: ["tools/screenshots.mjs", "tools/screenshots-flows.mjs", "tools/check-copy.mjs", "tools/slices.mjs"],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
  {
    files: ["apps/web/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: { "react-hooks/rules-of-hooks": "error", "react-hooks/exhaustive-deps": "warn" },
  },
);
