import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import tailwindcss from "@tailwindcss/vite";
import type { UserConfig } from "vitest/config";

const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // Point every @krishna/core deep-path at the REAL packages/core file, not the
      // node_modules/@krishna/core symlink. Vite serves the package's internal modules
      // via their realpath (packages/core/...), so aliasing to the symlink path created
      // a second module instance — startup.ts set the driver/http shims on one copy while
      // the hooks read getDatabase()/getHttpFetch() from the other ("SqlDriver not set").
      "@krishna/core/database/driver": path.resolve(__dirname, "packages/core/database/driver.ts"),
      "@krishna/core/database": path.resolve(__dirname, "packages/core/database/index.ts"),
      "@krishna/core/http": path.resolve(__dirname, "packages/core/http.ts"),
      "@krishna/core/settings": path.resolve(__dirname, "packages/core/settings.ts"),
      "@krishna/core/secrets": path.resolve(__dirname, "packages/core/secrets.ts"),
      "@krishna/core/tools/mcp-bridge": path.resolve(__dirname, "packages/core/tools/mcp-bridge.ts"),
      "@krishna/core/tools/computer": path.resolve(__dirname, "packages/core/tools/computer.ts"),
      "@krishna/core/tools": path.resolve(__dirname, "packages/core/tools/index.ts"),
      "@krishna/core/functions": path.resolve(__dirname, "packages/core/functions/index.ts"),
      "@krishna/core/executor": path.resolve(__dirname, "packages/core/executor.ts"),
      "@krishna/core/resolver": path.resolve(__dirname, "packages/core/resolver.ts"),
      "@krishna/core/action-policy": path.resolve(__dirname, "packages/core/action-policy.ts"),
      "@krishna/core/config-constants": path.resolve(__dirname, "packages/core/config-constants.ts"),
      "@krishna/core/chat-constants": path.resolve(__dirname, "packages/core/chat-constants.ts"),
      "@krishna/core/safe-local-storage": path.resolve(__dirname, "packages/core/safe-local-storage.ts"),
    },
  },
  test: {
    pool: "threads",
  } satisfies UserConfig["test"],
  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri` and large binary assets
      ignored: ["**/src-tauri/**", "**/*.onnx", "**/*.wasm"],
    },
  },
}));
