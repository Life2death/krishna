import { build } from "esbuild";
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { resolve, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));

const BRAIN_DIR = resolve(__dirname, "..");
const DIST_DIR = join(BRAIN_DIR, "dist");
const RESOURCES_DIR = resolve(BRAIN_DIR, "../../src-tauri/resources/brain");
const BUNDLED_NM = join(RESOURCES_DIR, "node_modules");
const ROOT_NM = resolve(BRAIN_DIR, "../../node_modules");

const PLATFORM = process.platform;
const ARCH = process.arch;

function platformKey(): string {
  return `${PLATFORM}-${ARCH}`;
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

function pruneCrossPlatformBinaries(): void {
  const onnxBin = join(BUNDLED_NM, "onnxruntime-node", "bin", "napi-v3");
  if (!existsSync(onnxBin)) return;
  const targetOs = PLATFORM;
  for (const osDir of readdirSync(onnxBin)) {
    if (osDir === targetOs) continue;
    const full = join(onnxBin, osDir);
    if (statSync(full).isDirectory()) {
      rmRecursive(full);
    }
  }
}

function dirSize(dir: string): number {
  let total = 0;
  if (!existsSync(dir)) return 0;
  function walk(d: string) {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "node_modules") walk(full);
      } else {
        try { total += statSync(full).size; } catch {}
      }
    }
  }
  walk(dir);
  return total;
}

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

  // 2. Clean resources/brain/ (keep node/)
  console.log("[2/4] Setting up resources/brain/…");
  if (existsSync(RESOURCES_DIR)) {
    if (!statSync(RESOURCES_DIR).isDirectory()) {
      rmSync(RESOURCES_DIR, { force: true });
    } else {
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

  // 3. Install native deps via npm into a staging dir, then move
  console.log("[3/4] Installing native deps via npm…");

  // Read installed versions from repo root node_modules
  function readVersion(pkgName: string): string {
    const p = join(ROOT_NM, pkgName, "package.json");
    return JSON.parse(readFileSync(p, "utf-8")).version;
  }

  const externalDeps: Record<string, string> = {
    "@libsql/client": readVersion("@libsql/client"),
    "@napi-rs/keyring": readVersion("@napi-rs/keyring"),
    "@xenova/transformers": readVersion("@xenova/transformers"),
  };

  const stagingDir = resolve(tmpdir(), `krishna-brain-stage-${Date.now()}`);
  const stagingNm = join(stagingDir, "node_modules");
  mkdirSync(stagingDir, { recursive: true });

  const pkgJson = {
    name: "krishna-brain-deps",
    private: true,
    dependencies: externalDeps,
  };
  writeFileSync(
    join(stagingDir, "package.json"),
    JSON.stringify(pkgJson, null, 2),
    "utf-8",
  );

  console.log(`  Staging dir: ${stagingDir}`);
  console.log(`  Installing: ${JSON.stringify(externalDeps)}`);

  execSync("npm install --omit=dev --no-package-lock --ignore-scripts", {
    cwd: stagingDir,
    stdio: "inherit",
    env: { ...process.env, npm_config_fund: "false", npm_config_audit: "false" },
  });

  // Move installed node_modules into resources
  if (existsSync(BUNDLED_NM)) {
    rmRecursive(BUNDLED_NM);
  }

  const moveTarget = dirname(BUNDLED_NM);
  const tempMoved = join(moveTarget, `node_modules.tmp`);
  if (existsSync(tempMoved)) rmRecursive(tempMoved);

  // Rename doesn't work across drives, so copy+delete
  cpSync(stagingNm, BUNDLED_NM, { recursive: true, force: true });
  rmRecursive(stagingDir);

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

main().catch((err) => {
  console.error("bundle-brain failed:", err);
  process.exit(1);
});
