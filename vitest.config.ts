import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: { jsx: "automatic" },
  resolve: { alias: { "@": fileURLToPath(new URL("./apps/web/src", import.meta.url)) } },
  test: {
    passWithNoTests: true,
    setupFiles: ["./apps/web/test/setup.ts"],
    include: ["packages/**/*.test.ts", "apps/**/*.test.{ts,tsx}", "scripts/**/*.test.ts", "tools/**/*.test.ts"],
  },
});
