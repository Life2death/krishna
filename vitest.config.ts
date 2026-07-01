import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/__tests__/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}", "packages/core/sync/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["node_modules/**", "apps/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/lib/**/*.ts", "src/lib/**/*.tsx"],
      exclude: ["src/lib/database/**", "node_modules/**"],
    },
  },
});
