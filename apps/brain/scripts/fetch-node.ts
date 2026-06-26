/**
 * fetch-node.ts — download portable Node.js into src-tauri/resources/brain/node/
 *
 * Downloads the standalone `node` binary for the current platform from the
 * official Node.js dist server, verifies it against the published SHA-256,
 * and places it at the path expected by `spawn_bundled` in brain.rs.
 *
 * Cache: the binary is cached in a temp dir (by version) so repeated builds
 * are fast. Delete the cache to force a re-download.
 *
 * Usage:  tsx scripts/fetch-node.ts [version]
 *         version defaults to NODE_VERSION below.
 *
 * Run from apps/brain/ after `npm run build:bundle`.
 */
import { createHash } from "node:crypto";
import { copyFileSync, createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, rmSync, chmodSync } from "node:fs";
import { get } from "node:https";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BRAIN_DIR = resolve(__dirname, "..");

// Default Node version — the latest LTS at time of writing.
// Update this when a new LTS ships.
const NODE_VERSION = process.argv[2] || "22.23.1";

const PLATFORM = process.platform; // "win32" | "darwin" | "linux"
const ARCH = process.arch; // "x64" | "arm64"

// Where the final node binary lands (matches what brain.rs expects).
function nodeDest(): string {
  const base = resolve(BRAIN_DIR, "../../src-tauri/resources/brain/node");
  if (PLATFORM === "win32") return resolve(base, "node.exe");
  if (PLATFORM === "darwin") return resolve(base, "bin", "node");
  return resolve(base, "bin", "node");
}

function nodeDir(): string {
  return resolve(BRAIN_DIR, "../../src-tauri/resources/brain/node");
}

// Download URL and filename for each platform.
function downloadInfo(): { url: string; archive: string; shaKey: string; binaryInArchive: string } {
  const ver = NODE_VERSION;
  switch (PLATFORM) {
    case "win32": {
      const arch = ARCH === "arm64" ? "arm64" : "x64";
      // Standalone node.exe (no zip — just the exe)
      return {
        url: `https://nodejs.org/dist/v${ver}/win-${arch}/node.exe`,
        archive: `node-v${ver}-win-${arch}.exe`,
        shaKey: `win-${arch}/node.exe`,
        binaryInArchive: "node.exe",
      };
    }
    case "darwin": {
      const arch = ARCH === "arm64" ? "arm64" : "x64";
      const ext = "tar.gz";
      return {
        url: `https://nodejs.org/dist/v${ver}/node-v${ver}-darwin-${arch}.tar.gz`,
        archive: `node-v${ver}-darwin-${arch}.tar.gz`,
        shaKey: `node-v${ver}-darwin-${arch}.tar.gz`,
        binaryInArchive: `node-v${ver}-darwin-${arch}/bin/node`,
      };
    }
    case "linux": {
      const arch = ARCH === "arm64" ? "arm64" : "x64";
      // Prefer .tar.xz for smaller download
      return {
        url: `https://nodejs.org/dist/v${ver}/node-v${ver}-linux-${arch}.tar.xz`,
        archive: `node-v${ver}-linux-${arch}.tar.xz`,
        shaKey: `node-v${ver}-linux-${arch}.tar.xz`,
        binaryInArchive: `node-v${ver}-linux-${arch}/bin/node`,
      };
    }
    default:
      throw new Error(`Unsupported platform: ${PLATFORM}`);
  }
}

/** Temp cache directory. */
function cacheDir(): string {
  const home = process.env.USERPROFILE || process.env.HOME || ".";
  return resolve(home, ".cache", "krishna-node", `v${NODE_VERSION}`);
}

// --- helpers ---------------------------------------------------------------

/** Cross-device-safe move: rename, fall back to copy+delete. */
function moveSync(src: string, dest: string): void {
  try {
    renameSync(src, dest);
  } catch {
    copyFileSync(src, dest);
    rmSync(src, { force: true });
  }
}

function download(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log(`  Downloading ${url} …`);
    const file = createWriteStream(dest);
    get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode} for ${url}`));
        return;
      }
      response.pipe(file);
      file.on("finish", () => {
        file.close();
        resolve();
      });
    }).on("error", (err) => {
      rmSync(dest, { force: true });
      reject(err);
    });
  });
}

function sha256(file: string): string {
  const data = readFileSync(file);
  return createHash("sha256").update(data).digest("hex");
}

async function fetchSha256Sum(version: string): Promise<Record<string, string>> {
  const url = `https://nodejs.org/dist/v${version}/SHASUMS256.txt`;
  return new Promise((resolve, reject) => {
    let data = "";
    get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        return;
      }
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        const map: Record<string, string> = {};
        for (const line of data.split("\n")) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          const parts = trimmed.split(/\s+/);
          if (parts.length >= 2) {
            // Sum follows format: <hash>  <filename>
            map[parts[1]] = parts[0];
          }
        }
        resolve(map);
      });
    }).on("error", reject);
  });
}

// --- main ------------------------------------------------------------------
async function main(): Promise<void> {
  const dst = nodeDest();
  const dir = nodeDir();
  const dl = downloadInfo();

  // Check if the binary already exists at the destination
  if (existsSync(dst)) {
    console.log(`  node ${NODE_VERSION} already at ${dst} — skipping download`);
    return;
  }

  // Use the archive filename in the cache (not the final dest)
  const cacheDirPath = cacheDir();
  const cacheFile = resolve(cacheDirPath, dl.archive);

  if (!existsSync(cacheFile)) {
    mkdirSync(cacheDirPath, { recursive: true });
    // Download the archive/exe
    await download(dl.url, cacheFile);

    // Verify SHA-256
    console.log("  Verifying SHA-256 …");
    const sums = await fetchSha256Sum(NODE_VERSION);
    const expectedSum = sums[dl.shaKey];
    if (expectedSum) {
      const actual = sha256(cacheFile);
      if (actual !== expectedSum) {
        rmSync(cacheFile, { force: true });
        throw new Error(
          `SHA-256 mismatch for ${dl.archive}\n  expected: ${expectedSum}\n  actual:   ${actual}`,
        );
      }
      console.log("  SHA-256 OK");
    } else {
      console.warn("  [warn] SHA-256 not found for this file — skipping verification");
    }
  }

  // Extract / copy to destination
  mkdirSync(dir, { recursive: true });

  if (PLATFORM === "win32") {
    // Standalone exe — just move (cross-device safe)
    moveSync(cacheFile, dst);
  } else {
    // Extract tar.gz / tar.xz
    const extractDir = resolve(cacheDirPath, `node-v${NODE_VERSION}-${PLATFORM}-${ARCH}`);
    if (!existsSync(extractDir)) {
      const { execSync } = await import("node:child_process");
      console.log(`  Extracting ${dl.archive} …`);
      if (dl.archive.endsWith(".tar.xz")) {
        execSync(`tar -xJf "${cacheFile}" -C "${cacheDirPath}"`, { stdio: "inherit" });
      } else {
        execSync(`tar -xzf "${cacheFile}" -C "${cacheDirPath}"`, { stdio: "inherit" });
      }
    }
    const binarySrc = resolve(extractDir, "bin", "node");
    if (!existsSync(binarySrc)) {
      throw new Error(`Expected binary not found at ${binarySrc}`);
    }
    moveSync(binarySrc, dst);
    chmodSync(dst, 0o755);
  }

  console.log(`  → ${dst}`);
  console.log(`  node ${NODE_VERSION} ready`);
}

main().catch((err) => {
  console.error("fetch-node failed:", err.message);
  process.exit(1);
});
