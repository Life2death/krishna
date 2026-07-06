import { createHash } from "node:crypto";
import { createWriteStream, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { get as httpsGet, RequestOptions } from "node:https";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const HF_BASE = "https://huggingface.co/Xenova/wavlm-base-plus-sv/resolve/main";
const HF_API_TREE = "https://huggingface.co/api/models/Xenova/wavlm-base-plus-sv/tree/main/onnx";

const DEST = resolve(ROOT, "public/models/Xenova/wavlm-base-plus-sv");
const ONNX_FILE = "onnx/model_quantized.onnx";

const FILES = [
  "config.json",
  "preprocessor_config.json",
  ONNX_FILE,
];

function request(url: string): Promise<{ data: Buffer; statusCode: number }> {
  return new Promise((resolve, reject) => {
    const doRequest = (currentUrl: string, redirectsLeft: number): void => {
      const options: RequestOptions = {};
      try {
        const parsed = new URL(currentUrl);
        options.hostname = parsed.hostname;
        options.path = parsed.pathname + parsed.search;
        options.method = "GET";
      } catch {
        reject(new Error(`Invalid URL: ${currentUrl}`));
        return;
      }

      httpsGet(options, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          if (redirectsLeft <= 0) {
            reject(new Error(`Too many redirects for ${currentUrl}`));
            return;
          }
          const location = res.headers.location;
          const nextUrl = location.startsWith("http") ? location : new URL(location, currentUrl).href;
          doRequest(nextUrl, redirectsLeft - 1);
          return;
        }
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          resolve({ data: Buffer.concat(chunks), statusCode: res.statusCode ?? 500 });
        });
      }).on("error", reject);
    };
    doRequest(url, 5);
  });
}

async function downloadFile(url: string, dest: string, maxRedirects = 5): Promise<void> {
  console.log(`  Downloading ${url} …`);
  const dir = dirname(dest);
  mkdirSync(dir, { recursive: true });

  const doDownload = (currentUrl: string, redirectsLeft: number): Promise<void> => {
    return new Promise((resolve, reject) => {
      const file = createWriteStream(dest);
      try {
        const parsed = new URL(currentUrl);
        httpsGet(
          { hostname: parsed.hostname, path: parsed.pathname + parsed.search, method: "GET" },
          (res) => {
            if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
              file.close();
              rmSync(dest, { force: true });
              if (redirectsLeft <= 0) {
                reject(new Error(`Too many redirects for ${currentUrl}`));
                return;
              }
              const location = res.headers.location;
              const nextUrl = location.startsWith("http") ? location : new URL(location, currentUrl).href;
              doDownload(nextUrl, redirectsLeft - 1).then(resolve, reject);
              return;
            }
            if (res.statusCode !== 200) {
              reject(new Error(`HTTP ${res.statusCode} for ${currentUrl}`));
              return;
            }
            res.pipe(file);
            file.on("finish", () => {
              file.close();
              resolve();
            });
          },
        ).on("error", (err) => {
          rmSync(dest, { force: true });
          reject(err);
        });
      } catch (err) {
        rmSync(dest, { force: true });
        reject(err);
      }
    });
  };

  return doDownload(url, maxRedirects);
}

function sha256(file: string): string {
  const data = readFileSync(file);
  return createHash("sha256").update(data).digest("hex");
}

async function fetchExpectedOnnxSha(): Promise<string | null> {
  try {
    const { data } = await request(HF_API_TREE);
    const entries = JSON.parse(data.toString());
    const entry = entries.find((e: any) => e.path === ONNX_FILE);
    if (entry?.lfs?.oid) {
      return entry.lfs.oid;
    }
    console.warn("  [warn] Could not find lfs.oid for onnx/model_quantized.onnx in HF API response");
    return null;
  } catch (err: any) {
    console.warn(`  [warn] HF API request failed: ${err.message} — skipping SHA verification`);
    return null;
  }
}

async function main(): Promise<void> {
  console.log("WavLM voice-ID model fetch");
  console.log(`  Destination: ${DEST}`);

  mkdirSync(resolve(DEST, "onnx"), { recursive: true });

  const expectedSha = await fetchExpectedOnnxSha();
  if (expectedSha) {
    console.log(`  Expected SHA-256 (from HF API): ${expectedSha}`);
  }

  for (const file of FILES) {
    const destPath = resolve(DEST, file);
    if (existsSync(destPath) && readFileSync(destPath).length > 0) {
      if (file === ONNX_FILE && expectedSha) {
        const actual = sha256(destPath);
        if (actual !== expectedSha) {
          console.log(`  ${file} — exists but SHA-256 mismatch (expected ${expectedSha}, actual ${actual}), re-downloading`);
          rmSync(destPath, { force: true });
        } else {
          console.log(`  ${file} — already exists, SHA-256 OK, skipping`);
          continue;
        }
      } else {
        console.log(`  ${file} — already exists, skipping`);
        continue;
      }
    }

    const url = `${HF_BASE}/${file}`;
    await downloadFile(url, destPath);
    const sizeMb = (readFileSync(destPath).length / (1024 * 1024)).toFixed(1);
    console.log(`  → ${destPath} (${sizeMb} MiB)`);

    if (file === ONNX_FILE && expectedSha) {
      const actual = sha256(destPath);
      if (actual !== expectedSha) {
        rmSync(destPath, { force: true });
        throw new Error(
          `SHA-256 mismatch for ${file}\n  expected: ${expectedSha}\n  actual:   ${actual}`,
        );
      }
      console.log("  SHA-256 OK");
    }
  }

  console.log("Done");
}

main().catch((err) => {
  console.error("fetch-voiceid-model failed:", err.message);
  process.exit(1);
});
