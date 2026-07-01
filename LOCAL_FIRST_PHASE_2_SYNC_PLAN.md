# Local-First — Phase 2: Client-side custom delta-sync

**Status:** ready for implementation. Branch off `feature/local-first-p1` (HEAD `fdeb63c`).
**Prereq context:** Phase 1 is done & verified — enroll → WavLM (512-dim) → AES-256-GCM
(`enc:v1:`, key = SHA-256 of `KRISHNA_MASTER_KEY`) → local SQLite `voiceprints`, decrypts &
round-trips, zero brain/`:8787` calls. See `LOCAL_FIRST_ARCHITECTURE_PLAN.md`.

## Goal
The local Tauri SQLite is the source of truth (brain is OUT of the runtime path). Add a
**custom delta-sync** layer that pushes/pulls row deltas between the local DB and the
existing **Turso** cloud DB, so cloud = durable backup + hub for the mobile app. Sync is
best-effort/background and MUST NOT block the local runtime.

## Decisions already made (do not re-litigate)
- **Approach:** custom delta-sync (chosen over libsql embedded-replica in the Tauri core —
  we want full control, no heavy Rust dep, and per-table selectivity).
- **Cloud target:** the **existing Turso DB**. Credentials already provisioned and stored in
  client secure storage during setup: `KRISHNA_SYNC_URL` (`libsql://…turso.io`) and
  `KRISHNA_SYNC_TOKEN` (see `src/pages/setup/index.tsx:99,102`). The brain already talks to
  this same Turso via `apps/brain/src/db/libsql-driver.ts` — reference that for the client
  protocol, but the client syncs INDEPENDENTLY (brain not in the path).
- **Conflict resolution:** last-write-wins by `updated_at`.

## Prerequisite cleanup (do first)
1. Delete dead brain voice-id: `apps/brain/src/voice-id/` (routes, store, embedding, test) and
   remove its two references in `apps/brain/src/index.ts`. Client voice-ID path is verified;
   this is dead code.
2. `interview_profiles` is **legacy from the naukri-lelo fork** (columns: `resume_text`,
   `goals`, `persona_text`). It is scheduled for removal (`INTERVIEW_REMOVAL_PLAN.md`). Do NOT
   sync it and do NOT rename it. Leave its removal to that plan; just exclude it here.

## Sync scope
**Sync these 9 tables:**
`conversations`, `messages`, `memories`, `memory_embeddings`, `learned_actions`, `skills`,
`system_prompts`, `reminders`, `voiceprints`.

**Do NOT sync:** `audit_log`, `command_log` (device-local trails), `devices` (sync infra /
device registry — managed by the sync layer, not synced as data), `interview_profiles`
(legacy, being removed).

Local schema lives in `src-tauri/src/db/migrations/*.sql` (+ inline `voiceprints` in
`packages/core/database/voiceprints.action.ts`).

## Schema changes
For every synced table:
- Ensure a stable text `id` PK (most already have one) and an `updated_at` column
  (integer epoch ms or ISO — be consistent repo-wide; several tables already have
  `updated_at`). Backfill `updated_at` for existing rows on migration.
- **Deletes → tombstones.** Add a dedicated `sync_tombstones(table_name TEXT, row_id TEXT,
  deleted_at INTEGER, PRIMARY KEY(table_name, row_id))`. On delete of a synced row, insert a
  tombstone instead of relying on the row's absence, so deletions propagate to other devices.
- Add a per-device sync watermark store: `sync_state(table_name TEXT PRIMARY KEY,
  last_pulled_at INTEGER, last_pushed_at INTEGER)`.

Add these as new migration files under `src-tauri/src/db/migrations/` and register them in
`src-tauri/src/db/main.rs` (follow the existing `include_str!` migration pattern).

## Sync engine
A TypeScript module (e.g. `packages/core/sync/`) invoked on a timer + on app foreground:
- **Push:** for each synced table, select rows where `updated_at > sync_state.last_pushed_at`
  (plus new tombstones), send to Turso, advance `last_pushed_at`.
- **Pull:** request remote rows/tombstones where `updated_at > sync_state.last_pulled_at`,
  upsert locally applying **LWW by `updated_at`** (incoming wins only if strictly newer),
  apply tombstones as local deletes, advance `last_pulled_at`.
- **Transport:** use `@libsql/client` (web/http variant) pointed at `KRISHNA_SYNC_URL` +
  `KRISHNA_SYNC_TOKEN` to run parameterized SQL against Turso directly. Keep the delta logic
  in our code (Turso is just the store). Do NOT route through the brain.
- **Resilience:** all sync is try/catch and best-effort. A sync failure (offline, DNS,
  auth) MUST log and no-op, never throw into the runtime. If `KRISHNA_SYNC_URL` is unset →
  sync disabled, app is "Local only" (mirror the existing status-dashboard convention).
- **Interval:** default ~60s (align with existing `KRISHNA_SYNC_INTERVAL` convention) +
  a manual "Sync now" trigger.

## Table-specific notes
- **`voiceprints`** sync as opaque `enc:v1:` blobs — never decrypt for sync. The shared
  `KRISHNA_MASTER_KEY` (same SHA-256 derivation) lets the mobile app decrypt. Keep the
  master key stable (changing it orphans all encrypted rows).
- **`memory_embeddings`** ARE synced (chosen over on-device re-embed). Add an
  **embedding-model-version guard**: store the model id/version with each embedding row; on
  pull, if the local model version differs, mark those `memories` for re-embed rather than
  trusting stale vectors. Prevents cross-device model drift.

## Tests (required — the architecture plan calls for sync-layer tests)
- Push delta selection respects `last_pushed_at`.
- Pull upsert applies LWW correctly (older incoming row is ignored; newer wins).
- Tombstone propagation: delete on device A → row removed on device B after pull.
- Offline / missing-creds path: sync no-ops, runtime unaffected.
- Voiceprint blob round-trips through sync without decryption.
- Embedding-version-mismatch triggers re-embed marking, not stale serve.

## Validation & workflow
- After each phase: `cd D:\Learning\krishna && npx tsc --noEmit` and
  `cd src-tauri && cargo check`, plus `npx vitest run`.
- Work in an isolated **git worktree**; commit stable checkpoints. Do NOT `git push` unless
  explicitly asked (push can trigger the release pipeline on tags; feature-branch push is
  safe but confirm first).
- Manual verify: two local DB copies (or two devices) → create/edit/delete in one → confirm
  it appears/disappears in the other after a sync cycle; confirm voiceprint enrolled on one
  decrypts/verifies on the other.

## Acceptance criteria
1. Create/update/delete on synced tables propagates both directions via Turso with LWW.
2. Tombstones propagate deletes.
3. `voiceprints` sync as encrypted blobs and remain decryptable with the shared key.
4. `memory_embeddings` sync with a version guard; mismatch → re-embed, not stale vectors.
5. Excluded tables (`audit_log`, `command_log`, `devices`, `interview_profiles`) never sync.
6. Offline/unconfigured → "Local only", runtime never blocked or broken.
7. `tsc` + `cargo check` + `vitest` all green; sync-layer tests pass.
