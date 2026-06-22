// Copies onnxruntime-web WASM files from node_modules to public/ so the
// VAD worker can load them locally without hitting any CDN at runtime.
// Runs automatically via the "prebuild" npm script before every build.
import { copyFileSync, mkdirSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = resolve(__dirname, "../node_modules/onnxruntime-web/dist");
const dest = resolve(__dirname, "../public");

mkdirSync(dest, { recursive: true });

const files = [
  "ort-wasm-simd-threaded.wasm",
  "ort-wasm-simd-threaded.asyncify.wasm",
  "ort-wasm-simd-threaded.jsep.wasm",
  "ort-wasm-simd-threaded.jspi.wasm",
];

for (const file of files) {
  const from = resolve(src, file);
  const to = resolve(dest, file);
  if (!existsSync(from)) {
    console.error(`[copy-wasm] Missing: ${from}`);
    process.exit(1);
  }
  copyFileSync(from, to);
  console.log(`[copy-wasm] Copied ${file}`);
}
console.log("[copy-wasm] Done.");
