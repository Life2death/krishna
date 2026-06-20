import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const core = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
  resolve: {
    // Order matters: most specific subpath first.
    alias: {
      "@krishna/core/types": core("../../packages/core/types/index.ts"),
      "@krishna/core": core("../../packages/core/index.ts"),
    },
  },
});
