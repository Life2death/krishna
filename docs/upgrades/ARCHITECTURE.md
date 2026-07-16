# Krishna self-improvement upgrade system — architecture contract (Stage 0)

**Status:** design contract only, no runtime code (per `Automation_with_LLM.md` Stage 0). This doc
is the thing the owner reads and approves before any of Stage 1's code gets written. If anything
here conflicts with `Automation_with_LLM.md` (the source spec), that file wins — this doc exists to
pin down the concrete details the spec deliberately left open (secret names, cost numbers,
kill-switch mechanics, exact file locations) so an implementing agent doesn't have to guess.

Full product spec: `Automation_with_LLM.md` (repo root). Read that first — this doc doesn't repeat
its rationale, only the contract details.

---

## State machine

```text
Captured -> Queued -> Analyzing -> Proposed
                                  |
                         Approved for code
                                  |
                             Implementing
                                  |
                           Review ready
                                  |
                    Completed / Rejected / Failed
```

Two mandatory, separate user approvals gate the two points where an agent's output can affect the
real repo:

1. **Approve implementation** — the only thing that permits an agent to touch a branch and open a
   draft PR. Before this, every provider run is read-only (a proposal).
2. **Approve merge or release** — a separate, later, human-only decision. No agent, coordinator, or
   automation in this system may merge a PR or cut a release. Ever.

## Status-ownership rule (the thing that prevents an Android/desktop write race)

**Clients (Android, desktop) never write `upgrade_tasks.status` or `upgrade_tasks.latest_run_id`
directly.** They only ever *append* rows to `upgrade_events` (e.g. `proposal_approved`,
`implementation_approved`, `proposal_rejected`). The GitHub coordinator is the **sole writer** of
`upgrade_tasks.status`/`latest_run_id` — it's the only actor that consumes events and advances
state. This is deliberate: two devices (or the same device before/after a sync round-trip) could
otherwise race to set `status` to two different values with no way to reconcile which one is
"real." An append-only event log has no such conflict — both devices' events land, in whatever
order sync delivers them, and the coordinator (running serially, one task at a time, via its own
concurrency lock) is the only thing that ever collapses them into a status transition.

Concretely: a client sets `upgrade_tasks.status` **only once**, at creation (`status = 'captured'`
or `'queued'`, written in the same local transaction that inserts the row — this is not a race
because no other writer exists yet at that point). After that, status is coordinator-owned until
the task reaches a terminal state.

## Data model

Three tables, matching `Automation_with_LLM.md`'s Data Model section exactly (field lists not
repeated here — see that doc). All three are **synchronized tables** (Turso), which in this repo
means touching **four separate places** — this is an existing, documented repo gotcha
(`Automation_with_LLM.md` calls it out explicitly) and Stage 1 must not skip any of them:

1. **Local migration SQL** — `src-tauri/src/db/migrations/*.sql`, registered in
   `src-tauri/src/db/main.rs`'s `migrations()` list. Latest is migration **22**
   (`device-commands-v22.sql`) — the three new tables should land as **23, 24, 25** (one migration
   per table, matching the existing one-table-per-migration convention), or a single **23** if
   Stage 1 prefers landing them together. Follow the `device-commands-v22.sql` file as the
   reference pattern for a synced table's shape and comments.
2. **Shared sync table list** — `packages/core/sync/types.ts`'s `SYNC_TABLES` const array. Add
   `'upgrade_tasks'`, `'upgrade_runs'`, `'upgrade_events'`.
3. **LibSQL transport schema** — `packages/core/sync/transport.ts`'s `TABLE_DDL` record (desktop
   path, used when `@libsql/client` is available).
4. **Rust-relay transport schema** — `packages/core/sync/rust-transport.ts`'s `TABLE_DDL` record
   (mobile/WebView path). **Correction worth noting explicitly**: despite the "Rust-backed" naming
   in earlier planning notes, this is a **TypeScript** file — it holds its own copy of the same
   `TABLE_DDL` strings and sends them as raw DDL through `invoke("sync_exec_multiple", ...)`. The
   actual Rust side (`src-tauri/src/mobile_bridge.rs`, functions `sync_exec`/`sync_exec_multiple`)
   is a generic, schema-agnostic SQL-over-Turso-HTTP executor — it holds no table/column knowledge
   and needs no changes when a new synced table is added. The four real edit points are all
   TypeScript/SQL, not Rust.

`upgrade_events` is append-only by convention, not by a DB constraint Stage 1 is required to add —
but Stage 1's local database layer (the "core types, validation, and database actions" in its own
scope) should expose no update/delete path for it, only insert, to make the append-only contract
hard to violate accidentally from application code.

Large terminal logs and patches stay as GitHub artifacts (Actions run logs, PR diffs) — Krishna
only stores summaries, hashes, statuses, and links, per the spec. No `upgrade_artifacts` table in
Stage 0/1; add it later only if a concrete need shows up.

## Provider policy

- Codex is primary (creates the first proposal; after approval, implements it).
- Claude Code is the reviewer (independent review of the proposal or the resulting diff).
- User-selectable: Codex-only, Claude-only, or Codex-plus-Claude.
- Exactly one provider implements an approved proposal; if both are selected, the other reviews.
- Cursor is out of scope for this delivery; the provider model stays extensible for it later.

## Named GitHub secrets

All provider credentials live **only** in GitHub Actions Secrets on this repo — never bundled into
the Android APK, never stored in the desktop app's local secure storage. Exact names the Stage 3
coordinator workflow will read:

| Secret | Purpose |
| --- | --- |
| `UPGRADE_OPENAI_API_KEY` | Codex provider auth. Deliberately not reusing any existing `OPENAI_*` secret name in this repo — this key is scoped to the upgrade coordinator's usage, so its cost/usage is separately attributable. |
| `UPGRADE_ANTHROPIC_API_KEY` | Claude Code provider auth. Same reasoning — separately attributable from any other Anthropic key this repo might use elsewhere. |
| `TURSO_DATABASE_URL` | Already an established name/pattern in this repo's other Turso-sync work (mobile sync baking, the CI/release pipeline) — reused as-is, not renamed, since it's the same database. |
| `TURSO_AUTH_TOKEN` | Same as above. |
| `UPGRADE_DISPATCH_PAT` | A **fine-grained** GitHub PAT scoped to `actions:write` on this repo only (no `contents:write`, no other repos) — used solely so the coordinator workflow itself can be manually dispatched. **Must not reuse the existing Job Hunter integration** (`GITHUB_PAT_STORAGE_KEY` / `integration_github_pat` in `src/lib/integrations/github-workflow.ts`, which targets a different repo — `Life2death/job-hunter` — with different scope needs and a different secure-storage key). The client-side copy of this token (for manual dispatch from the app, not for provider calls) goes in a **new** secure-storage key, `integration_upgrade_dispatch_pat`, explicitly distinct from Job Hunter's key. |

`release.yml`/`android.yml`'s use of `secrets.GITHUB_TOKEN` (the standard Actions-provided token)
is unrelated and untouched by this feature — that's CI's own release/build auth, not a provider
credential.

## Cost limits (concrete numbers, not symbolic — pick real ones now, revisit after Stage 4 usage data)

| Limit | Value | Rationale |
| --- | --- | --- |
| Max tokens per single provider run | 200,000 tokens | Generous enough for a full-context proposal or implementation pass on this repo's size; a run that exceeds this is aborted and marked `failed` with `error = "token_limit_exceeded"`, not silently truncated. |
| Max wall-clock timeout, proposal run | 20 minutes | Proposal runs are read-only and don't run builds/tests — should be fast; a hang past this is a bug, not legitimate work. |
| Max wall-clock timeout, implementation run | 45 minutes | Includes edits + typecheck + focused tests, per the spec's validation strategy. |
| Automatic runs per rolling 24h | 1 | Matches the spec's scheduling rule exactly (highest-priority oldest queued task, concurrency-locked). |
| Manual runs per rolling 24h (combined, all providers) | 5 | Prevents a user (or a bug in the client) from hammering the dispatch endpoint; generous enough for real interactive use during Stage 3/4 testing. |
| Monthly cost cap | $50 USD equivalent (tracked as summed `cost_usd` across `upgrade_runs` in the rolling calendar month) | A real ceiling, not symbolic. The coordinator checks the running total **before** dispatching any provider call (proposal or implementation) and refuses with a `cost_cap_reached` event if the call would exceed it. This is a workflow-level check (reads `upgrade_runs.cost_usd` via the Turso HTTP API before proceeding), not a provider-side setting — providers don't know about Krishna's budget. |

These numbers are deliberately conservative for the first real usage; revisit once Stage 4's
automatic-analysis usage data exists. Do not leave any of them symbolic/TBD when Stage 1 code
starts referencing them — hardcode these exact values (as named constants, not magic numbers) and
change this table + the constants together if they're revised.

## Kill switch

Two layers, so either one alone is sufficient to stop new provider calls:

1. **Authoritative, server-side: `UPGRADES_PAUSED` GitHub repo variable** (not a secret — it's a
   boolean flag, not sensitive). The coordinator workflow checks this **first**, before touching
   the queue, the database, or any provider. If `true`, the workflow run exits immediately, logs
   why, and does not consume its scheduled slot. This is the real kill switch — it stops runs even
   if every client app is offline or somehow bypassed the second layer.
2. **Client-side, UX-layer: a Settings toggle** ("Pause self-improvement" or similar, under the
   Upgrades settings section from `Automation_with_LLM.md`'s Cross-Platform UI plan). When off,
   the client refuses to create new `upgrade_tasks` rows and refuses to append
   `manual_analysis_requested`/`*_approved` events — it's a local guard, not authoritative (a
   client could theoretically be bypassed or out of sync), which is exactly why layer 1 exists
   independently. Stage 1 should sync this toggle's state as a simple key in whatever local
   settings store already exists (not a new synced table) — Stage 2 can decide whether it needs to
   sync across devices at all, since layer 1 is what actually matters for safety.

Turning the kill switch on never needs to touch running/in-flight work — an in-progress
`upgrade_runs` row is left to finish or fail on its own; the kill switch only prevents **new**
dispatches from that point on.

## Security boundaries (restated from the spec, for completeness in this contract)

- Provider keys: GitHub Secrets only, per the table above.
- Client-stored token: only the narrow `UPGRADE_DISPATCH_PAT` (client copy), `actions:write`-only,
  in platform secure storage (`secureStorage.set`/`.get` — `src/lib/secure-storage.ts`, backed by
  AES-256-GCM + machine-derived key on desktop, Android Keystore/StrongBox on mobile via
  `src-tauri/src/keystore.rs`). Same storage mechanism the existing Job Hunter PAT already uses,
  different key name.
- Proposal jobs: read-only repository access (the coordinator checks out the repo read-only, or a
  narrowly-scoped read token — exact mechanism is a Stage 3 implementation detail, not pinned here).
- Implementation jobs: an isolated branch, least-privilege write access to that branch only.
- Coordinator credentials kept separate from provider-job credentials wherever the GitHub Actions
  permission model allows it.
- Branch protection + CI on `main` remain mandatory and untouched by this feature.
- Any prompt input sourced from command logs, screenshots, or on-screen content is untrusted data
  — never forwarded to a provider without the explicit user confirmation step the spec's Capture
  flow already requires (step 3: "Ask whether that command evidence should be attached").
- Default posture: no automatic code generation, no automatic merge, no automatic release. Nothing
  in Stage 0–6 changes that default; every stage that touches code requires the two approval gates
  above.

## Agent guidance

Providers (Codex, Claude Code) receive, per task:
- Root `AGENTS.md` (this repo) — architecture orientation, build/validate commands, hard
  constraints (never write to `main`, never merge, never release, no unrelated refactors, no
  secret access beyond what the job's own scoped credentials already provide).
- `CLAUDE.md` (this repo) — thin pointer to `AGENTS.md`, so Claude Code's own convention of reading
  `CLAUDE.md` first still resolves to the same guidance.
- `schemas/upgrade-proposal.v1.json` — the versioned schema every proposal-run response must
  validate against. A response that doesn't validate is a failed run, not a best-effort partial
  proposal — malformed provider output should never reach the user as if it were a real proposal.
- Per-task scope: the specific `acceptance_criteria_json` from `upgrade_tasks`, plus an explicit
  instruction that anything outside that scope is out of bounds for this run (no drive-by
  refactors, no touching unrelated files "while I'm in there").

## Non-goals for this document

This is Stage 0 only. It does not create: the GitHub Actions coordinator workflow, the local SQLite
migrations, any UI, any client-side capture/voice-command wiring, or the actual PAT/API-key values
(those get created by the owner directly in GitHub Settings once this doc is approved — an agent
should never handle real credential values). Stage 1 begins only after the owner has read this doc
and `schemas/upgrade-proposal.v1.json` and confirmed the approval gates, cost numbers, and
kill-switch behavior match intent, per `Automation_with_LLM.md`'s Required Approvals section.
