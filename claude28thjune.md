# Krishna — Session resume (2026-06-28)

Self-contained handoff. Continues from [claude26thjune.md](claude26thjune.md).
"NEXT ACTIONS" (§3) is the fast path. **Big correction to yesterday's §5 below.**

---

## 0. Quick context (unchanged)
- `D:\Learning\krishna` — Tauri (Rust + React/TS) voice assistant. Brain = `apps/brain` (Node/Fastify via `tsx`), listens `127.0.0.1:8787`. Desktop **spawns the brain as a bundled local sidecar** (`src-tauri/src/brain.rs`: `spawn_dev`/`spawn_bundled`).
- Worktrees: `krishna` (main, stable), `krishna-agent` (feature/voice-android, voice-ID), `krishna-agent2` (feature/android-control, Android + cloud-brain).
- Workflow: Claude reviews/plans (+ small fixes when asked); a separate agent writes most code.

## 1. ⚠️ BIG CORRECTION — Anthropic IS reachable (yesterday's §5 was a misdiagnosis)
Yesterday's note "the machine blocks api.anthropic.com / api.github.com at device level" was **wrong** — it was based on `curl` failing. Today, proven:
- **naukri-lelo (Tauri app, provider `claude`, model `claude-sonnet-4-6`) reached Anthropic and returned real AI answers** on this exact network. `git push`/`fetch` to GitHub also worked.
- The `curl` "HTTP 000 / RST" is a **Git Bash + phone-hotspot artifact**: the PC is on the phone's hotspot (IPv6 / NAT64, DNS resolver = the phone `10.231.19.176`, which returns a broken IPv6 for these hosts). Git Bash `curl` uses that dead path; the Windows app stack (reqwest/`tauriFetch` + WebView2) resolves and connects fine.
- **Takeaway:** don't trust `curl` from Git Bash here. Trust the app (or `Test-NetConnection`/`Resolve-DnsName` via PowerShell). Anthropic/GitHub work for the apps.
- (CloudflareWARP was **uninstalled** today — it had been hijacking the Tauri dev-server bind to its `172.16.0.2` adapter, breaking Android dev loads. Not needed for connectivity on the current hotspot.)

## 2. Krishna desktop — re-diagnosed correctly
The "broken desktop" symptoms were **the brain being down**, NOT Anthropic:
| Symptom | Real cause |
|---|---|
| Blank dashboard | Krishna was in **remote mode** → dashboard conversations/MCP/devices come from the brain (`:8787`), which never started. |
| "Failed to fetch voice" (enroll) | Voice-ID is **brain-backed** (WavLM `/voice/enroll`); brain was down. Voice-ID needs the brain in **both** local & remote chat modes. |
| Local-mode chat | Untested in-app, but uses the **same `claude`/`tauriFetch` path naukri just proved** → should work. |

### 2a. THE real desktop bug — brain hangs on startup
The brain blocks on **Turso sync / Telegram init BEFORE it calls `listen()`** → never binds within the desktop's **30s auto-spawn timeout** → "Brain failed to start within 30s" → all brain-backed features look broken. Confirmed twice (hung right after `[db] 10 migrations applied`). Workaround that binds in ~2s:
```
cd apps/brain && KRISHNA_RAG_DISABLED=true KRISHNA_SYNC_URL= KRISHNA_SYNC_TOKEN= TELEGRAM_BOT_TOKEN= npm start
```
**Fix for a stable desktop (do this): make the brain `app.listen()` FIRST, then run Turso sync / Telegram / Gmail / MCP init in the background (non-blocking).** Also consider raising the 30s spawn timeout in `lib.rs`. Other latent gaps seen in the desktop console (non-fatal): `secure_storage_get` command not found; MCP hook hardcodes `localhost:8787`.

## 3. 👉 NEXT ACTIONS — stable desktop
1. **Fix brain startup** (§2a: bind-then-init-async) so the brain reliably comes up → dashboard populates, voice-ID works, no manual start.
2. **Verify local-mode chat**: relaunch Krishna (`npm run tauri dev`), send a message — should answer like naukri (claude/`claude-haiku-4-5-20251001`, key already configured).
3. **Voice-ID**: with the brain up, re-test enroll/verify (model + 6 enrolled samples already present in the brain DB).
4. Debug technique that works here: launch the app with `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9223`, then read its console/DOM over CDP (Git Bash node + `ws`). This is how the blank-dashboard cause (`ERR_CONNECTION_REFUSED :8787`) was found.

## 4. Android device-control — status (paused, parked)
On-device run today (Galaxy M06, `R9ZY40XK38A`) surfaced + fixed a long chain of **port gaps** — the app had never actually been run on a device:
- Kotlin `JSONObject` import; ACL via `build.rs` `InlinedPlugin` + `capabilities/android.json`; **snake_case** command alignment (invoke/Kotlin/ACL); completed `android.json` (added `sql`/`keychain`/`http`/`log`/`opener` + the **`dashboard`** window); CSP missing the brain host; **`speechSynthesis` shim** in `main.tsx` (undefined in Android WebView → white screen).
- Result: app **builds + installs + renders** on device. But the empirical `setTorch` proof was blocked by the flaky WebView debug bridge + the app's many unported runtime assumptions. The error progression (`Plugin not found` → `Command not found` → accepted/dispatched) proves the plugin code is correct at the ACL/dispatch layer.
- **Committed checkpoint `297dc4e`** on `feature/android-control` (device-control + cloud-brain + port fixes). CDP test harnesses `cdp-*.mjs` left untracked.
- **Conclusion:** finishing the Android port is a real workstream, not a quick verification. Hand the spec docs to the agent.

## 5. Cloud-brain (Fly) — code done on the android branch
On `feature/android-control` (`297dc4e`): configurable `KRISHNA_BRAIN_HOST` + `$PORT`, loopback-only `/shutdown`, `fly.toml` (region `bom`), CSP `krishna-brain.fly.dev`, `scripts/print-master-key.ts`. The LAN brain was validated today — `/chat`→Anthropic worked from both the PC and the phone over Wi-Fi.

## 6. Spec docs created today (committed `38885b4` on main)
- `ANDROID_ACL_PERMISSIONS_FIX.md` (+ snake_case follow-up) · `BRAIN_DEVICE_CONTROL_PROMPT_FIX.md` (device-control action vocab is in the **client** prompt `krishna.context.tsx` ~L1480, relayed to the brain) · `REMOTE_CLOUD_BRAIN_FIX.md` (Fly deploy; Turso as durability; bind/host/CSP).

## 7. naukri-lelo-v2 (separate repo — context only)
Today: merged 4 remote fixes (6.1.3: correct Claude model IDs, reliable model-field saving, preserve api_key on model switch) into the **7.0.0** line (the prompt-**caching**/failover/regenerate work), built the exe locally (works, reaches Anthropic), and pushed `main` + tag **`v7.0.1`** → GitHub Release pipeline (Krishna's & naukri's releases trigger on `v*` **tags**, not branch push).

## 8. Critical rules (unchanged)
- ONE shared `KRISHNA_MASTER_KEY` across devices/cloud (encrypts memories/Gmail/voiceprint). `.env` only — a different key orphans encrypted rows.
- Releases trigger on **`v*` tag** push only; branch push to `main` runs CI tests only (so this doc push is safe).
- Agent works only in its worktree; commit per build-passing step.
- "Validated" = the capability demonstrated for real, not a green plumbing test.
