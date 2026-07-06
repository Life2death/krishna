# VID-1 fix — bundle the WavLM voice-ID model locally (design)

> Reviewer-authored design, 2026-07-06. Fixes VID-1 (`RESUME_HERE.md` §5): the WavLM model
> re-fetches from Hugging Face on every reload because `env.allowLocalModels = false` in
> `src/lib/voice-id/embedding.ts:53` forces a remote fetch unconditionally, and browser-cache
> writes only commit after the full download completes — a mid-download reload loses all
> progress. This blocks VID-2 (voice-ID meter stuck at 5 samples) from being diagnosed.
> Agent protocol as usual: one phase per commit, `tsc --noEmit` + `vitest run` clean, STOP
> per phase, worktree `krishna-m15`, branch fresh off `main`.

## The problem, precisely
`getModel()` in `embedding.ts` calls `AutoProcessor.from_pretrained("Xenova/wavlm-base-plus-sv")`
and `AutoModel.from_pretrained(..., { quantized: true })` with `env.allowLocalModels = false`.
Reading `node_modules/@xenova/transformers/src/utils/hub.js:430`: when `allowLocalModels` is
false, the local-file-check block is skipped entirely — every call goes straight to
`https://huggingface.co/Xenova/wavlm-base-plus-sv/resolve/main/...`, regardless of whether
`env.useBrowserCache` has a good copy. `useBrowserCache` only helps *within* one already-warm
Cache Storage entry, and the response is only written to cache after the full body downloads
(`hub.js:478-484`) — so a reload mid-download (common: the response has no `content-length`,
per the existing warning at `embedding.ts:56`, so the download is slow and easy to interrupt)
throws away all progress and starts over.

`allowLocalModels` was already set to `false` as a workaround, not a considered choice — the
comment at `embedding.ts:48-52` documents that turning it on previously broke, because
transformers.js probed `/models/Xenova/wavlm-base-plus-sv/...` and nothing existed there, so
Vite's SPA fallback served `index.html` for the 404 and the JSON parser choked on
`"<!DOCTYPE..."`. The fix is to make the files actually exist at that path, not to keep
avoiding local loading.

**This exact mechanism already works in this codebase** for the VAD models
(`public/silero_vad_v5.onnx`, `public/silero_vad_legacy.onnx`, loaded via
`baseAssetPath: "/"` in `KrishnaVAD.tsx:32`) — proof that Vite's `public/` → Tauri's
`frontendDist` (`../dist`, confirmed in `src-tauri/tauri.conf.json`) pipeline serves static
assets identically in dev and prod. No new Tauri asset-protocol work is needed.

## Confirmed exact files (fetched from the live HF repo, 2026-07-06)
`Xenova/wavlm-base-plus-sv` on Hugging Face contains:
- `config.json`
- `preprocessor_config.json`
- `onnx/model_quantized.onnx` — **101,683,453 bytes (~97 MiB)**, this is the one actually
  requested (`quantized: true` in `embedding.ts:87`)
- `onnx/model.onnx` (402 MiB, unquantized) — NOT needed, don't fetch it
- `quantize_config.json` — build-time only, not needed at runtime

## Why NOT commit the ~97 MiB file to git like the VAD models
The VAD `.onnx` files are small (~1-2 MB) and committed directly — fine at that size. 97 MiB
is a different animal: it doubles the repo's clone size forever (git never forgets a blob),
sits right at GitHub's 100 MB hard file-size cap, and every future clone/checkout pays for it
even though it's a cache-able CDN artifact. The right precedent already exists in this repo:
`apps/brain/scripts/fetch-node.ts` downloads a large platform binary at build time into a
**gitignored** destination, with SHA-256 verification against a published checksum and a
local disk cache so repeat builds don't re-download. Mirror that pattern, not the VAD one.

## Design — three phases

### Phase 1 — `fetch-voiceid-model.ts` build-time fetch script
New script (repo root `scripts/` or alongside `fetch-node.ts`'s pattern), same shape:
- Downloads `config.json`, `preprocessor_config.json`, `onnx/model_quantized.onnx` from
  `https://huggingface.co/Xenova/wavlm-base-plus-sv/resolve/main/<file>` into
  `public/models/Xenova/wavlm-base-plus-sv/<file>` (creating `onnx/` subdir).
- Skips download if the destination file already exists (matches `fetch-node.ts:161`).
- Verifies `onnx/model_quantized.onnx` against its known content hash — HF's tree API
  (`/api/models/Xenova/wavlm-base-plus-sv/tree/main/onnx`) returns the LFS blob `oid` (a
  SHA-256) for this file; pin the expected hash as a constant and compare after download,
  same as `fetch-node.ts`'s `SHASUMS256.txt` check. Small JSON config files don't need
  hash-pinning.
- Add `"fetch:voiceid": "tsx scripts/fetch-voiceid-model.ts"` to `package.json`, and wire it
  as a `predev`/`prebuild`-style step (or document it as a required one-time setup command —
  decide based on how `fetch:node` is currently invoked; check `BUNDLED_DISTRIBUTION_PLAN.md`
  / CI workflow for the existing pattern before choosing).
- Add `public/models/` to `.gitignore`.

### Phase 2 — point `embedding.ts` at the local copy
- Flip `env.allowLocalModels = true` (or just delete the line — `true` is the default), keep
  `env.allowRemoteModels = true` as a fallback for anyone who hasn't run the fetch script
  (dev-machine resilience, not a silent production dependency on HF uptime).
- Confirm `env.localModelPath` resolves to `/models/` (the transformers.js default) so the
  request lands on `/models/Xenova/wavlm-base-plus-sv/config.json` etc. — matching where
  Phase 1 placed the files.
- Delete the now-obsolete comment block explaining why local models were disabled; replace
  with a one-line note pointing at this plan doc for context.
- Manual verify: cold app start with **no network** (airplane mode / firewall-block
  huggingface.co) still completes enrollment + verify — this is the real acceptance bar,
  stronger than "doesn't re-download."

### Phase 3 — CI / packaging wiring
- `.github/workflows/release.yml` and `android.yml` need the fetch step added wherever
  `fetch:node` (or equivalent) already runs, so release builds ship with the model baked in
  rather than depending on a build-machine's HF connectivity.
- Confirm the ~97 MiB addition to `public/` doesn't blow past any installer-size assumption
  documented in `BUNDLED_DISTRIBUTION_PLAN.md` — read that file first; if there's a size
  budget, flag it to the owner before proceeding rather than silently exceeding it.

## Explicitly rejected alternatives
- **Just fix `useBrowserCache` persistence (option (a) in RESUME_HERE.md §5):** doesn't
  survive a mid-download reload regardless of whether the cache backend persists across app
  restarts, because the write only happens after a *complete* download — the actual failure
  mode observed. Also still depends on Hugging Face being reachable on first run of every
  fresh install, which local bundling avoids entirely.
- **Committing the raw `.onnx` straight into git** (matching the VAD precedent literally):
  rejected above on size grounds — right precedent is `fetch-node.ts`, not the VAD files.
- **Tauri custom asset protocol / `convertFileSrc`:** unnecessary — `public/` → Vite dev
  server → `dist/` → `frontendDist` already round-trips correctly for the VAD models; adding
  a second serving mechanism for one more model would be needless divergence.

## Acceptance (owner, live)
1. Fresh checkout → run the fetch script once → `public/models/Xenova/wavlm-base-plus-sv/`
   contains the three files, `onnx/model_quantized.onnx` is ~97 MiB.
2. Block network access to `huggingface.co` (hosts-file entry or firewall rule) → `npm run
   tauri dev` → voice-ID enrollment and verify both complete normally (proves it's serving
   local files, not silently falling through to remote).
3. `Ctrl+R` reload mid-conversation, repeatedly → model load stays fast (local file, not a
   CDN fetch) every time — this is the actual VID-1 symptom, gone.
4. Unblocks VID-2: with reloads no longer corrupting model load, capture one clean
   `[voice-id] verify: score=… threshold=… match=…` console line to diagnose the stuck-meter
   theory.
