# ✅ COMPLETED — "Naukri Lelo" → "Krishna" rebrand

All safe-to-rename code references have been updated. Only DO-NOT-TOUCH persisted identifiers remain.

## DO NOT TOUCH — persisted identifiers (unchanged, verified)

- `src-tauri/src/secure.rs:12` — `b"naukri-lelo-encryption-v1"` encryption salt
- `src-tauri/src/api.rs:31,34,37` — `"naukri_lelo_license_key"`, `"naukri_lelo_instance_id"`, `"selected_naukri_model"` store keys
- `src-tauri/src/window.rs:13` — window label fallback (no longer present — verified clean)

## What was changed

| Item | Action |
|---|---|
| `src-tauri/naukri-lelo.desktop` → `krishna.desktop` | Renamed + contents updated |
| `images/banner.svg` | Deleted |
| `generate_icon.py` | Deleted |
| `src-tauri/info.plist` | Updated display name to "Krishna" |
| `src-tauri/src/speaker/*.rs` | Log strings, PulseAudio names → "Krishna" |
| `src-tauri/src/lib.rs:48` | Crash dump → `krishna-crash.txt` |
| `src/contexts/app.context.tsx` | Comments → "Krishna" |
| `src/hooks/useHistory.ts` + `useCompletion.ts` | Event key → `"krishna-conversation-selected"` |
| `src/hooks/useSystemPrompts.ts` | localStorage key → `"selected_krishna_prompt"` |
| `src/__tests__/common.function.test.ts` | Test value → "Krishna" |
| `LICENSE`, `SECURITY.md` | Copyright/contact → "Krishna" |
| `apps/brain/src/db/migrations.ts:9` | Comment → "Krishna lineage" |

## Remaining "naukri" hits in source code

```
apps/brain/src/db/migrations.ts:9  —  comment referencing fork history (harmless)
src-tauri/src/secure.rs:12         —  DO NOT TOUCH (encryption salt)
src-tauri/src/api.rs:31,34,37     —  DO NOT TOUCH (store keys)
```

All remaining hits outside source code are in historical planning docs (`*_PLAN.md`, `PHASE_*`, `CHANGELOG.md`, etc.) — left as-is per the "don't rewrite history" rule.

## Verification

- `grep -rin "naukri" --exclude-dir={node_modules,target,.git} .` → only DO-NOT-TOUCH + historical docs
- `npm test` — green
- `npm run typecheck` — clean
- Encryption salt unchanged → existing secrets still decrypt
- `.desktop` renamed → `tauri.conf.json` references verified
