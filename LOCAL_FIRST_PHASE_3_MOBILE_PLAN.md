# Local-First — Phase 3: Mobile companion (Android)

**Status:** ready for implementation once the master-key approach below is acknowledged.
**Prereq:** Phase 0–2 are on `main` (`2563896`). Mobile is the **same Tauri codebase** on
Android, so Phase 3 **reuses** `packages/core/sync`, the local SQLite plugin, and
`voice-client` rather than a rewrite. See `LOCAL_FIRST_ARCHITECTURE_PLAN.md` §Tier 3.

## Goal
An Android companion that, when online, sees the **same memories/conversations** as the laptop
via the existing Turso delta-sync, chats **directly to Anthropic** (its own BYOK key), and works
from a **local cache** offline. "Krishna, follow me."

## Decisions (locked 2026-07-01)
- **Voice-ID on mobile: DEFERRED past v1.** Phase 3 does chat + memory + sync parity only. No
  WavLM/enrollment on Android yet. (Synced voiceprints still arrive as encrypted blobs for a
  future mobile voice-ID; just don't run the model.)
- **Device-control plugin: SEPARATE TRACK** (torch/etc., `ANDROID_ACL_PERMISSIONS_FIX.md`) — out
  of scope here.
- **Master key: baked at build + hardware-sealed** (details + honest caveat below).

## Master-key provisioning & protection  ⚠️ read the caveat
The mobile app needs the **same** `KRISHNA_MASTER_KEY` as the desktop to decrypt the shared
encrypted store. Chosen approach (owner: custom app, physically self-installed, never on a store):

1. **Build-time injection** — read the key from an **uncommitted** build secret (local `.env` /
   CI secret; NEVER commit it) and inject at compile time. Each owner build carries the key; no
   pairing step at runtime.
2. **Seal into Android hardware Keystore on first launch** — import as a **non-exportable** AES
   key (use **StrongBox** when `PackageManager.FEATURE_STRONGBOX_KEYSTORE` is present). After
   sealing, do all AES-GCM via the Keystore handle so the raw key never persists in app storage;
   wipe any transient copy.
3. **Obfuscate + hide the injected seed** — enable **R8/ProGuard**; store the seed in **native
   (NDK) code** or an encrypted blob, not a Java/Kotlin string constant; enable string
   encryption. Raises the reverse-engineering bar sharply.

**CAVEAT (must stay true in any UI/marketing):** a key embedded in a client app is **not**
provably unextractable. A determined attacker with the APK **and** a rooted device **and**
dynamic analysis (Frida) can recover it, because the app must decrypt the key to use it. The
stack above makes this *expensive and rooted-device-only* — a strong, appropriate posture for a
self-installed device, **not** an "impossible to extract" guarantee. Do not claim otherwise.

**Stronger alternative (owner's option):** since the owner is physically present at install,
**enter the key once at install → seal into Keystore → nothing extractable ships in the APK at
all.** More secure than baking; costs one install-time step. Implement this if the owner prefers
it over build-time baking.

## Scope of work
1. **Verify the sync path on Android.** Confirm the Tauri `sql` (SQLite) plugin and
   `@libsql/client` in `packages/core/sync/transport.ts` run in the Android WebView; if
   `@libsql/client`'s web build won't run on Android, route Turso calls through a **Rust command**
   (Tauri) instead. The `SyncEngine`/delta logic itself is platform-agnostic and should reuse
   as-is.
2. **Local cache + offline.** Local SQLite is the read/write cache on mobile too; sync is
   background/non-blocking (same engine, LWW + tombstones). App must fully work with cloud
   unreachable (Principle 3/4).
3. **Chat direct to Anthropic** with mobile's own BYOK key in **Android secure storage** (the
   `secure_get`/`secure_set` path already exists; confirm it maps to Android Keystore-backed
   storage).
4. **Mobile UI.** Mobile-appropriate layout for chat + memory browse/create; reuse existing
   components where they adapt. No always-on VAD/voice-ID surface in v1.
5. **First-run bootstrap.** Master-key seal (above) + initial cloud pull to hydrate the local
   cache; show a "syncing / local-only" state per the existing status convention.

## Explicitly OUT of scope (Phase 3)
- Voice-ID enrollment/verification on mobile (deferred).
- Device-control plugin (separate track).
- Gmail / MCP relocation (that's Phase 4).

## Tests / acceptance
1. Fresh install → key seals into Keystore → initial pull hydrates local cache → memories from
   the laptop are visible on mobile.
2. Create a memory on mobile → after a sync cycle it appears on the laptop (and vice-versa); a
   delete propagates (tombstone).
3. Airplane mode: chat still composes from local cache; memory read/write works; sync resumes on
   reconnect — nothing blocks.
4. Encrypted rows decrypt on mobile with the shared key; sync payloads never contain plaintext.
5. Security check: confirm the raw master key is **not** present in app SharedPreferences/plain
   storage after first launch (only the Keystore handle is used).
6. `tsc` + `cargo check` (Android target) + `vitest` green; add mobile-path sync tests.

## Validation & workflow
- Work in a git worktree; commit checkpoints; don't push until asked (feature-branch push is
  safe — release only fires on `v*` tags).
- Reuse, don't fork, `packages/core/sync`. Any Android divergence should be an adapter (e.g. a
  Rust transport command), not a second copy of the delta logic.
