import { build } from "esbuild";
import { copyFileSync, cpSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const nativeModules = [
  "@libsql/client",
  "@napi-rs/keyring",
  "@xenova/transformers",
];

await build({
  entryPoints: ["src/index.ts"],
  outfile: "dist/brain.js",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  external: nativeModules,
  alias: {
    "@krishna/core": resolve(__dirname, "../../packages/core/index.ts"),
    "@krishna/core/database/driver": resolve(__dirname, "../../packages/core/database/driver.ts"),
  },
  resolveExtensions: [".ts", ".js", ".json", ".node"],
  mainFields: ["module", "main"],
  banner: {
    js: `import { createRequire } from "module";\nconst require = createRequire(import.meta.url);`,
  },
});

console.log("Brain bundled to dist/brain.js");

