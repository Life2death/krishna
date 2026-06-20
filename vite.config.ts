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
      "@krishna/core/database/driver": path.resolve(__dirname, "node_modules/@krishna/core/database/driver.ts"),
      "@krishna/core/database": path.resolve(__dirname, "node_modules/@krishna/core/database/index.ts"),
      "@krishna/core/http": path.resolve(__dirname, "node_modules/@krishna/core/http.ts"),
      "@krishna/core/settings": path.resolve(__dirname, "node_modules/@krishna/core/settings.ts"),
      "@krishna/core/secrets": path.resolve(__dirname, "node_modules/@krishna/core/secrets.ts"),
      "@krishna/core/tools/mcp-bridge": path.resolve(__dirname, "node_modules/@krishna/core/tools/mcp-bridge.ts"),
      "@krishna/core/tools": path.resolve(__dirname, "node_modules/@krishna/core/tools/index.ts"),
      "@krishna/core/functions": path.resolve(__dirname, "node_modules/@krishna/core/functions/index.ts"),
      "@krishna/core/executor": path.resolve(__dirname, "node_modules/@krishna/core/executor.ts"),
      "@krishna/core/resolver": path.resolve(__dirname, "node_modules/@krishna/core/resolver.ts"),
      "@krishna/core/action-policy": path.resolve(__dirname, "node_modules/@krishna/core/action-policy.ts"),
      "@krishna/core/config-constants": path.resolve(__dirname, "node_modules/@krishna/core/config-constants.ts"),
      "@krishna/core/chat-constants": path.resolve(__dirname, "node_modules/@krishna/core/chat-constants.ts"),
      "@krishna/core/safe-local-storage": path.resolve(__dirname, "node_modules/@krishna/core/safe-local-storage.ts"),
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
