# Krishna — Session resume (2026-06-26)

Self-contained handoff for tomorrow. Read top-to-bottom; "NEXT ACTIONS" is the fast path.
Continues from [claude25thjune.md](claude25thjune.md).

---

## 0. Quick context
- **Project:** `D:\Learning\krishna` — Tauri (Rust + React/TS) voice assistant. Brain = `apps/brain`
  (Node/Fastify via `tsx`, NOT compiled). Node v26 → run brain with `npm start` (NOT `npm run dev` —
  `tsx watch` hangs on Node 26). Brain listens on `127.0.0.1:8787`.
- **Workflow:** Claude reviews/plans (+ small fixes when asked); a separate coding agent writes most code.
- **Three working dirs (git worktrees, same repo):**
  - `D:\Learning\krishna` — branch `main`, the **stable/test** checkout (also where session .md + plan docs live).
  - `D:\Learning\krishna-agent` — branch `feature/voice-android`, the **voice-ID** work (PR #5).
  - `D:\Learning\krishna-agent2` — branch `feature/android-control`, the **Android device-control** work.

## 1. PR / branch status
- **PR #4 (voice-ID Phase 1, brain)** — MERGED to main. `/voice/enroll|verify|status`, WavLM
  (`Xenova/wavlm-base-plus-sv`, 512-dim, model cached ~97MB), encrypted voiceprint store.
- **PR #5 (voice-ID Phase 2, desktop)** — **OPEN, NOT merged.** Gated on §2.4.1 real-voice calibration.
  Tip commit `c7653cb`. Has: the gate (3 paths: action/plan/skill), enrollment UI, status badge,
  threshold slider, enable toggle, + today's fixes (16kHz enroll, bodyLimit, score log).
- **Android device-control** — **UNCOMMITTED WIP** in `krishna-agent2`, **untested**, no PR. See §4.
- `main` tip ≈ `b8440dd` (docs). Local main may need `git pull` if behind origin.

## 2. What today accomplished
- **Bundle fix validated** (agent's 2nd attempt): boots clean OUTSIDE the repo, all transitive deps
  present, native libsql DB executes. Clean-machine-ready. → in checkpoint `b58101a` on main.
- **First-run setup wizard reviewed + fixed** (4 bugs caught: `Math.random`→`crypto.getRandomValues`;
  key regenerated every render → `useMemo`; `useNavigate` outside Router → `FirstRunGuard` route +
  Rust startup routes the dashboard window to `/setup` on first run; CI `if` env-scope → `secrets`).
- **Code-signing** infra reviewed — acceptable; needs a real Authenticode cert to activate.
- **Checkpoint `b58101a`** committed to main; **worktree isolation** set up (see §0).
- **Voice-ID Phase 1 merged** (PR #4); **Phase 2 built + reviewed** (PR #5, open).
- **Real-voice calibration started** — see §3. Found + fixed the 16kHz enroll bug and a brain bodyLimit
  bug; diagnosed a machine-level network block.
- **Android device-control implemented** by the agent (uncommitted, untested) — see §4.

## 3. 👉 NEXT ACTIONS — voice-ID calibration (finish §2.4.1, then merge PR #5)
Real-voice testing today got the owner self-score from **0.44 → ~0.80** after the 16kHz enroll fix.
Remaining to close the §2.4.1 merge gate:
1. **Relaunch** to resume (all services were stopped at session end):
   - Brain: `cd D:\Learning\krishna-agent\apps\brain && npm start` → wait for `/health`.
   - App: `cd D:\Learning\krishna-agent && npm run tauri dev` (Rust is cached now → fast).
     - NOTE: `src-tauri/resources/brain/` is gitignored, so the worktree needs a placeholder dir or
       it fails the Tauri build with "resource path doesn't exist". A `.dev-placeholder` file was
       created there today (untracked) — recreate if missing: `mkdir resources/brain && touch a file`.
2. **Settings → Voice ID:** lower **Threshold to ~0.72** (0.85 default is too strict — owner scores
   ~0.75–0.85). Re-enroll is NOT needed (already 6 samples at 16kHz post-fix), but re-enrolling cleanly
   never hurts.
3. **Impostor test (was pending — no 2nd speaker available today):** have **2–3 other people** speak.
   Read their scores from the brain log: `grep "voice-id] verify"` in the brain's task output (a
   `console.log` of `score/threshold/match` was added in `routes.ts`). Set threshold in the gap
   (above the owner ~0.75, below impostors). Record the table in PR #5.
4. **Confirm-path test:** as an unverified speaker, trigger (a) an `open` action and (b) a learned
   skill → both must prompt for confirmation and **execute on "yes"** (skill must NOT auto-run).
5. Pass → put numbers in PR #5 → **merge** → then resume Android.

## 4. Android device-control — review BEFORE trusting (uncommitted WIP)
In `D:\Learning\krishna-agent2` (feature/android-control), **all uncommitted, untested, no PR.** Agent
built `DeviceControlPlugin.kt` (Kotlin, 7 cmds: setTorch/listApps/launchApp/openSetting/setVolume/
setDnd/requestBluetoothEnable), `device_control.rs`, lib.rs registration, manifest perms, and 7 new
frontend action types in `actions.ts`/`action-policy.ts`/`types`.
- ⚠️ **Build order violated** — built all 7 commands without first proving the `setTorch` bridge on a
  device. Do the on-device `setTorch` proof FIRST (`npm run tauri android dev`, physical phone).
- ⚠️ **Merge conflict incoming** — android-control and voice (PR #5) both edit `src/lib/actions.ts`,
  `packages/core/action-policy.ts`, `types/assistant.ts`. **Merge PR #5 first**, then rebase
  android-control onto main and re-apply the 7 actions on top of voice's `resolveActionForConfirm`
  gate (android sensitive actions should also route through the unverified-speaker confirmation).
- ⚠️ Agent mislabeled the brain as "Python" (it's Node) and falsely claimed "PR #5 merged" — verify
  its claims against actual code/git.
- `DeviceControlPlugin.kt` is under `src-tauri/gen/android/` (generated dir) — committed here, but
  fragile to `tauri android` regeneration; keep an eye on it.

## 5. ⚠️ Environment blocker (NOT a code bug)
The **work machine blocks `api.anthropic.com` AND `api.github.com`** at the device level (instant RST
to valid IPs, survives network switch; Turso/Google/HuggingFace work fine). Likely corporate
security/VPN filtering AI + code-hosting APIs. Effect: Krishna's **AI replies (`/chat`) fail with
"failed to fetch"**; voice-ID itself is local and unaffected. This also explains earlier truncated
`npm install`s (mermaid/native binaries) and Turso DNS errors. **To get AI responses:** IT-whitelist
those hosts, fully disconnect the corporate VPN/agent, or run on a personal device/network.

## 6. Outstanding polish (spec'd for the agent in VOICE_IDENTITY_PLAN.md)
- **VoiceIdSettings UX** (§2.4.2 + earlier notes): (a) download-progress bar — first enroll silently
  downloads the ~97MB model while the button says "Recording…"; add a `GET /voice/model-status` +
  progress UI. (b) Record button auto-stop after ~3s with countdown, or relabel it a **Stop** button
  (it currently shows a spinner that reads as "loading", so users don't know to click again to stop).
  (c) Surface the live verify score in the UI so calibration doesn't need brain logs.

## 7. Key file map (voice-ID)
- Brain: `apps/brain/src/voice-id/{embedding,store,routes}.ts` · `index.ts` (bodyLimit) ·
  `db/migrations.ts` (voiceprints) · `routes/status.ts` (voiceId block) · `config.ts`
  (`KRISHNA_VOICE_ID_ENABLED`, `KRISHNA_VOICE_THRESHOLD`).
- Frontend: `src/components/KrishnaVAD.tsx` (parallel verify) · `src/contexts/krishna.context.tsx`
  (gate ~1128, three exec paths) · `src/lib/voice-client.ts` · `src/lib/actions.ts`
  (`resolveActionForConfirm`) · `src/pages/settings/components/VoiceIdSettings.tsx` (enroll/threshold/toggle).
- Plans: `VOICE_IDENTITY_PLAN.md` (§2.4.1 calibration gate, §2.4.2 the 16kHz fix), `ANDROID_CONTROL_PLAN.md`.

## 8. Critical rules (unchanged)
- ONE shared `KRISHNA_MASTER_KEY` across devices (encrypts memories/Gmail/voiceprint). `.env` only.
- Brain binds 127.0.0.1; `/health`,`/ws`,`/shutdown` auth-exempt; everything else bearer-token.
- Agent works ONLY in its worktree; never edit another checkout. Commit per build-passing step.
- "Validated" = the capability demonstrated (real voices), not a green plumbing test.
