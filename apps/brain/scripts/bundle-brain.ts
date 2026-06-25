/**
 * bundle-brain.ts — produce a complete, self-contained brain runtime under
 * src-tauri/resources/brain/ so `spawn_bundled` works on a clean machine.
 *
 * 1. Runs esbuild to produce dist/brain.js
 * 2. Copies dist/brain.js → resources/brain/brain.js
 * 3. Copies only the *runtime-essential* files from each external native
 *    module into resources/brain/node_modules/ so require() resolves.
 *
 * Native modules (marked `external` in build.ts) and their platform-specific
 * binaries that this script handles:
 *
 *   @libsql/client          → @libsql/win32-x64-msvc/index.node
 *   @napi-rs/keyring        → @napi-rs/keyring-win32-x64-msvc/*.node
 *   @xenova/transformers    → onnxruntime-node (native, platform binary)
 *
 * Usage:  tsx scripts/bundle-brain.ts
 *         (run from apps/brain/ after npm install)
 */
import { build } from "esbuild";
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { resolve, dirname, join, relative, basename } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// --- paths ----------------------------------------------------------------
const BRAIN_DIR = resolve(__dirname, ".."); // apps/brain
const DIST_DIR = join(BRAIN_DIR, "dist");
const RESOURCES_DIR = resolve(BRAIN_DIR, "../../src-tauri/resources/brain");
const BUNDLED_NM = join(RESOURCES_DIR, "node_modules");
const ROOT_NM = resolve(BRAIN_DIR, "../../node_modules");

const PLATFORM = process.platform; // "win32" | "darwin" | "linux"
const ARCH = process.arch; // "x64" | "arm64"

// --- external native modules & what they need at runtime -------------------
interface NativeDep {
  /** Package name in node_modules. */
  pkg: string;
  /** Globs / relative paths to include from the package dir. */
  include: string[];
  /** Exclude patterns (subtracted from include). */
  exclude?: string[];
  /**
   * Platform-specific optional dependency that this package loads
   * at runtime (e.g. @libsql/win32-x64-msvc). Keyed by OS-arch.
   */
  platformDep?: Record<string, string>;
}

const NATIVE_DEPS: NativeDep[] = [
  {
    pkg: "@libsql/client",
    include: ["package.json", "lib-cjs/**/*.js", "lib-cjs/package.json"],
    platformDep: {
      "win32-x64": "@libsql/win32-x64-msvc",
      "darwin-x64": "@libsql/darwin-x64",
      "darwin-arm64": "@libsql/darwin-arm64",
      "linux-x64": "@libsql/linux-x64-gnu",
    },
  },
  {
    pkg: "@libsql/core",
    include: ["package.json", "lib-cjs/**/*.js", "lib-cjs/package.json"],
  },
  {
    pkg: "@napi-rs/keyring",
    include: ["package.json", "index.js", "keytar.js"],
    platformDep: {
      "win32-x64": "@napi-rs/keyring-win32-x64-msvc",
      "darwin-x64": "@napi-rs/keyring-darwin-x64",
      "darwin-arm64": "@napi-rs/keyring-darwin-arm64",
      "linux-x64": "@napi-rs/keyring-linux-x64-gnu",
    },
  },
  {
    pkg: "@xenova/transformers",
    include: [
      "package.json",
      "dist/transformers.js",
      "dist/transformers.min.js",
    ],
    exclude: ["dist/ort-wasm*.wasm"],
  },
  {
    pkg: "onnxruntime-node",
    include: [
      "package.json",
      `bin/napi-v3/${platformDir()}/**`,
      "dist/**/*.js",
    ],
  },
  {
    pkg: "onnxruntime-common",
    include: ["package.json", "dist/**/*.js"],
  },
];

function platformDir(): string {
  if (PLATFORM === "win32") return `win32/${ARCH}`;
  if (PLATFORM === "darwin") return `darwin/${ARCH}`;
  return `linux/${ARCH}`;
}

function platformKey(): string {
  return `${PLATFORM}-${ARCH}`;
}

// --- glob-like pattern matching (simplified) ------------------------------
function matchPattern(pattern: string, filePath: string): boolean {
  // "**" matches zero-or-more path segments, "*" matches within one segment.
  // Escape dots and other special chars except * and **.
  const normalized = filePath.replace(/\\/g, "/");
  let regexStr = "^";
  let i = 0;
  while (i < pattern.length) {
    if (pattern[i] === "*" && pattern[i + 1] === "*" && pattern[i + 2] === "/") {
      // **/ — matches zero or more path segments (including none)
      regexStr += "(.*/)?";
      i += 3;
    } else if (pattern[i] === "*" && pattern[i + 1] === "*" && i + 1 === pattern.length - 1) {
      // trailing **
      regexStr += ".*";
      i += 2;
    } else if (pattern[i] === "*") {
      regexStr += "[^/]*";
      i += 1;
    } else if (pattern[i] === ".") {
      regexStr += "\\.";
      i += 1;
    } else if (pattern[i] === "/") {
      regexStr += "/";
      i += 1;
    } else {
      regexStr += pattern[i];
      i += 1;
    }
  }
  regexStr += "$";
  return new RegExp(regexStr).test(normalized);
}

function shouldExclude(relPath: string, excludes: string[]): boolean {
  const normalized = relPath.replace(/\\/g, "/");
  for (const pattern of excludes) {
    if (matchPattern(pattern, normalized)) return true;
  }
  return false;
}

function collectFiles(
  pkgDir: string,
  include: string[],
  exclude: string[],
): string[] {
  const allFiles: string[] = [];
  walkDir(pkgDir, (filePath) => {
    const rel = relative(pkgDir, filePath).replace(/\\/g, "/");
    for (const pattern of include) {
      if (matchPattern(pattern, rel)) {
        if (!shouldExclude(rel, exclude)) {
          allFiles.push(filePath);
        }
        break;
      }
    }
  });
  return allFiles;
}

function walkDir(dir: string, cb: (f: string) => void): void {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      // Skip nested node_modules (deps are hoisted)
      if (entry.name === "node_modules") continue;
      walkDir(full, cb);
    } else {
      cb(full);
    }
  }
}

// --- copy helpers ---------------------------------------------------------
function copyFiles(files: string[], srcRoot: string, destRoot: string): void {
  for (const src of files) {
    const rel = relative(srcRoot, src);
    const dest = join(destRoot, rel);
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(src, dest);
  }
}

function copyPackage(name: string, dest: string): void {
  const src = join(ROOT_NM, name);
  if (!existsSync(src)) {
    console.warn(`  [warn] Package "${name}" not found at ${src} — skipping`);
    return;
  }
  const pkgDest = join(dest, name);
  const depInfo = NATIVE_DEPS.find((d) => d.pkg === name);

  if (depInfo) {
    // Selective copy — only the files listed in `include`
    const files = collectFiles(src, depInfo.include, depInfo.exclude ?? []);
    console.log(`  ${name}: ${files.length} files (selective)`);
    copyFiles(files, ROOT_NM, dest);
  } else {
    // Full copy (for packages without a NativeDep entry, e.g. platform deps)
    console.log(`  ${name}: full copy`);
    cpSync(src, pkgDest, { recursive: true, force: true });
  }
}

function copyPlatformDep(
  depSpec: Record<string, string> | undefined,
  dest: string,
): void {
  if (!depSpec) return;
  const pkgName = depSpec[platformKey()];
  if (!pkgName) {
    console.warn(
      `  [warn] No platform dep for ${platformKey()} — skipping`,
    );
    return;
  }
  copyPackage(pkgName, dest);
}

// --- platform-specific cleanup for onnxruntime-node -----------------------
/**
 * Remove binaries for non-current platforms from the copied onnxruntime-node
 * (saves ~70 MB). Also removes the nested onnxruntime-web from transformers
 * (not used under Node).
 */
function pruneCrossPlatformBinaries(): void {
  const onnxBin = join(BUNDLED_NM, "onnxruntime-node", "bin", "napi-v3");
  if (!existsSync(onnxBin)) return;
  const targetOs = PLATFORM; // "win32" | "darwin" | "linux"
  for (const osDir of readdirSync(onnxBin)) {
    if (osDir === targetOs) continue; // keep current platform
    const full = join(onnxBin, osDir);
    if (statSync(full).isDirectory()) {
      rmRecursive(full);
    }
  }
}

function rmRecursive(target: string): void {
  if (!existsSync(target)) return;
  const st = statSync(target);
  if (!st.isDirectory()) {
    try { rmSync(target, { force: true }); } catch {}
    return;
  }
  const entries = readdirSync(target, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(target, entry.name);
    if (entry.isDirectory()) {
      rmRecursive(full);
    } else {
      try { rmSync(full, { force: true }); } catch {}
    }
  }
  try { rmSync(target, { recursive: true, force: true }); } catch {}
}

// --- run ------------------------------------------------------------------
async function main(): Promise<void> {
  console.log("=== bundle-brain ===\n");

  // 1. esbuild
  console.log("[1/4] Bundling brain.js with esbuild…");
  await build({
    entryPoints: [join(BRAIN_DIR, "src/index.ts")],
    outfile: join(DIST_DIR, "brain.js"),
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
    external: ["@libsql/client", "@napi-rs/keyring", "@xenova/transformers"],
    alias: {
      "@krishna/core": resolve(BRAIN_DIR, "../../packages/core/index.ts"),
      "@krishna/core/database/driver": resolve(
        BRAIN_DIR,
        "../../packages/core/database/driver.ts",
      ),
    },
    resolveExtensions: [".ts", ".js", ".json", ".node"],
    mainFields: ["module", "main"],
    banner: {
      js: `import { createRequire } from "module";\nconst require = createRequire(import.meta.url);`,
    },
  });
  console.log("  → dist/brain.js\n");

  // 2. Clean and create output dirs
  console.log("[2/4] Setting up resources/brain/…");
  if (existsSync(RESOURCES_DIR)) {
    // If an old file sits where the dir should be, remove it first.
    if (!statSync(RESOURCES_DIR).isDirectory()) {
      rmSync(RESOURCES_DIR, { force: true });
    } else {
      // Remove old node_modules and brain.js (but keep node/ if present)
      const entries = readdirSync(RESOURCES_DIR, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name === "node") continue;
        const full = join(RESOURCES_DIR, entry.name);
        if (entry.isDirectory()) {
          rmRecursive(full);
        } else {
          try { rmSync(full, { force: true }); } catch {}
        }
      }
    }
  }
  mkdirSync(BUNDLED_NM, { recursive: true });

  // 3. Copy external native modules
  console.log("[3/4] Copying native modules…");
  for (const dep of NATIVE_DEPS) {
    if (dep.pkg === "onnxruntime-common") {
      // onnxruntime-common is nested inside onnxruntime-node's node_modules
      const nestedSrc = join(
        ROOT_NM,
        "onnxruntime-node/node_modules/onnxruntime-common",
      );
      if (existsSync(nestedSrc)) {
        copyPackage("onnxruntime-common", join(BUNDLED_NM, "onnxruntime-node/node_modules"));
      }
      continue;
    }
    copyPackage(dep.pkg, BUNDLED_NM);
    copyPlatformDep(dep.platformDep, BUNDLED_NM);
  }

  // 4. Copy brain.js
  console.log("[4/4] Copying brain.js → resources/brain/…");
  copyFileSync(join(DIST_DIR, "brain.js"), join(RESOURCES_DIR, "brain.js"));

  // 5. Prune cross-platform binaries
  console.log("\nPruning cross-platform onnxruntime binaries…");
  pruneCrossPlatformBinaries();

  // Summary
  console.log("\n=== bundle-brain complete ===");
  const size = dirSize(RESOURCES_DIR);
  console.log(`  resources/brain/ total: ${(size / 1024 / 1024).toFixed(1)} MB`);
}

function dirSize(dir: string): number {
  let total = 0;
  if (!existsSync(dir)) return 0;
  walkDir(dir, (f) => {
    try {
      total += statSync(f).size;
    } catch {}
  });
  return total;
}

main().catch((err) => {
  console.error("bundle-brain failed:", err);
  process.exit(1);
});
