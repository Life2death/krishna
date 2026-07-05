# Android roadmap — consolidated (owner decisions 2026-07-05)

> Single phased plan replacing the scattered Android state. Supersedes nothing — it SEQUENCES the
> existing docs: `LOCAL_FIRST_PHASE_3_MOBILE_PLAN.md` (voice terminal), `ANDROID_CONTROL_PLAN.md` +
> `ANDROID_DEVICE_CONTROL_FIXSPEC.md` + `ANDROID_ACL_PERMISSIONS_FIX.md` (device control),
> `ANDROID_SIGNING_HANDOFF.md` (release). Architecture v2 rule: **mobile is a conversation-only
> voice terminal**; the laptop stays the brain.

## Owner decision (2026-07-05): **A2 voice terminal FIRST** — talking to Krishna from the phone
matters more than device control. A3 (torch etc.) comes after.

## Current state (from the parked branches)
- Phase 3 Android app **builds and runs on-device** (`feature/voice-android`) — NDK recipe + 5
  Android-only fixes are recorded in memory/docs (JNI, migration, ndk-context, ACL capabilities,
  speechSynthesis).
- Device control (`feature/android-control`) is **blocked on Tauri v2 ACL permissions for the
  inline plugin** (`setTorch`) — fixspec exists (`ANDROID_ACL_PERMISSIONS_FIX.md`).
- Signed builds: android v2.0.5 signed draft exists (`ANDROID_SIGNING_HANDOFF.md`).

## Phases

| Phase | Goal | Content | Gate |
|---|---|---|---|
| **A1** | Healthy base | Rebase/refresh `feature/voice-android` onto current `main` (it is far behind); confirm on-device build still passes with the NDK recipe; carry forward the 5 fixes; CI-less local build doc | none |
| **A2** | **Voice terminal MVP** (owner priority) | Conversation-only: mic → STT → brain/cloud relay → spoken reply on device. No device control, no local DB beyond session cache. Reuse `M4_COMMAND_RELAY_PLAN.md` transport decisions. Push-to-talk first; wake word later | A1 |
| **A3** | Device control v1 | Land the ACL permissions fix (`ANDROID_ACL_PERMISSIONS_FIX.md`), get `setTorch` working end-to-end as the proof, then extend per `ANDROID_CONTROL_PLAN.md` | A2 |
| **A4** | Sync | Memories/reminders sync with the laptop hub per `LOCAL_FIRST_PHASE_2_SYNC_PLAN.md` decisions | A2 |
| **A5** | Release | Signing pipeline (`ANDROID_SIGNING_HANDOFF.md`), versioning, publish draft | A2+ |

## Rules
- Android work happens in the dedicated worktrees (`krishna-agent`, `krishna-agent2`), NOT in
  `krishna-m15` — keep desktop tracks isolated.
- Same review protocol: one phase per commit, findings file `ANDROID_REVIEW_FINDINGS.md`.
- Do NOT start A1 until the owner schedules it — desktop queue (item 7 P3, RR-2, settings reorg)
  currently outranks Android.
