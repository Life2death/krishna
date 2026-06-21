# Agent Handoff — Finish the "Naukri Lelo" → "Krishna" rebrand

> **For the build agent:** the project was forked from "Naukri Lelo" and renamed to Krishna. The
> README + GitHub portal are already done. This task scrubs the remaining stale references.
> **Read the "DO NOT TOUCH" list first** — some occurrences are persisted identifiers that will break
> existing installs (encryption, keychain, stored data) if renamed.

## How to find them all

```bash
grep -rin "naukri" --exclude-dir=node_modules --exclude-dir=target --exclude-dir=.git .
```

Work through the hits in the categories below. After editing, re-run the grep — only the intentionally
preserved identifiers (see DO NOT TOUCH) should remain.

---

## ⛔ DO NOT TOUCH — persisted identifiers (renaming breaks existing installs)

These strings are baked into stored data / OS keychains. Changing them orphans or corrupts user data.
**Leave them exactly as-is** (a one-line comment noting "legacy identifier, do not rename" is fine):

- `src-tauri/src/secure.rs:12` — `hasher.update(b"naukri-lelo-encryption-v1")` is the **encryption-key
  derivation salt**. Changing it makes every previously-encrypted stored secret undecryptable. **Never change.**
- `src-tauri/src/api.rs:31,34` — `"naukri_lelo_license_key"`, `"naukri_lelo_instance_id"` are secure-store
  keys. (License is unused — Krishna is free — but the keys are persisted.) Leave them.
- `src-tauri/src/window.rs:13` — `app.get_webview_window("naukri-lelo")` is a window-label fallback.
  **Verify the actual runtime window label first** (check `tauri.conf.json` `app.windows[].label` and any
  `WebviewWindowBuilder` label in `lib.rs`). Only rename if you confirm the live label changed too;
  otherwise leave it.

---

## ✅ Safe to rename — packaging / user-facing (do these)

1. **`src-tauri/naukri-lelo.desktop`** — rename the file to `krishna.desktop`; update `Name=`, `Exec=`,
   `Icon=`, `Comment=`, and any `StartupWMClass=` inside to Krishna. If `tauri.conf.json` or the bundler
   references the old `.desktop` name, update that reference too.
2. **`src-tauri/info.plist`** — update `CFBundleName` / display-name strings to "Krishna".
3. **`images/banner.svg`** — still reads "Naukri Lelo — Free AI Interview Assistant". Either delete it
   (the README no longer references it) or replace the text with Krishna branding (gold, chakra motif).
   Simplest: delete it and drop any remaining references.
4. **`generate_icon.py`** — the old blue-"N" icon generator, superseded by `generate_chakra_icon.py`
   (the gold chakra). **Delete `generate_icon.py`.**

## ✅ Safe to rename — code comments & cosmetic strings (do these)

These are comments or user-cosmetic strings with no persistence:

- `src-tauri/src/speaker/*.rs` — header comments ("Naukri Lelo … speaker input") and `error!(...)` log
  strings → "Krishna". Also `linux.rs:341` PulseAudio **application name** `"naukri-lelo"` and the
  `Context::new(..., "naukri-lelo-device-enum")` strings → `"krishna"` / `"krishna-device-enum"`
  (cosmetic — shown in the OS audio mixer; safe to change).
- `src-tauri/src/speaker/mod.rs:67`, `commands.rs:1` — comments.
- `src-tauri/src/lib.rs:48` — crash dump filename `naukri-lelo-crash.txt` → `krishna-crash.txt` (cosmetic).
- `apps/brain/src/db/migrations.ts:9` — comment referencing "the Naukri Lelo lineage" → reword to Krishna.
- `src/contexts/app.context.tsx:145,158,160,176` — comments ("Naukri Lelo is fully free") → "Krishna".

## ⚠️ Rename only if you update BOTH sides together (localStorage keys)

These are localStorage keys / cross-window event names. They're not long-term stored data, but both the
writer and reader must change in lockstep or the feature silently breaks:

- `"naukri-lelo-conversation-selected"` — used in `src/hooks/useHistory.ts:173` **and**
  `src/hooks/useCompletion.ts:495`. Rename both to `"krishna-conversation-selected"`.
- `"selected_naukri_lelo_prompt"` — `src/hooks/useSystemPrompts.ts:178`. Grep for any other reader of
  this key before renaming; rename all together (or leave it — it's only a cleanup `removeItem`).

## Optional — test fixture & docs (low priority)

- `src/__tests__/common.function.test.ts:55-56` — uses `"Naukri Lelo"` as an arbitrary test value;
  swap to `"Krishna"` for tidiness (no behavior impact).
- Historical planning docs (`*_PLAN.md`, `PHASE_*`, `INTERVIEW_REMOVAL_PLAN.md`, `CHANGELOG.md`,
  `PROJECT_STRUCTURE.md`, `docs/ROADMAP.md`) — these are a historical record; **leave them** unless the
  user asks. Do NOT rewrite history.
- `LICENSE`, `SECURITY.md`, `.github/ISSUE_TEMPLATE/bug-report.yml` — update any "Naukri Lelo" in
  copyright/contact/user-facing copy to "Krishna".

---

## Verify

- `grep -rin "naukri" --exclude-dir={node_modules,target,.git} .` returns **only** the DO-NOT-TOUCH
  persisted identifiers (secure.rs salt, api.rs keys, and window.rs if left).
- `npm test` (client) + `cd apps/brain && npm test` — green (the test-fixture rename, if done, still passes).
- Root `npm run typecheck` + `cd apps/brain && npm run typecheck` — clean.
- `npm run build` (client production) — green.
- **Encryption sanity:** confirm `secure.rs` salt is unchanged so existing encrypted secrets still decrypt.
- If `.desktop` was renamed, confirm the Linux bundle config still points at the right file name.
```
