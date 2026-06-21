# Krishna Ecosystem — Implementation Plan & Coding Handoff

> **Single source of truth.** Supersedes the earlier vision/implementation drafts.
> **For the coding agent:** read this top-to-bottom once, then execute **phase by phase, in order**.
> Do **not** skip Phase 0 — every later phase depends on its seams. After each phase, run its
> **Verify** step and stop for human review before starting the next.

---

## Status (last updated 2026-06-21)

| Phase | State | Notes |
|---|---|---|
| **Phase 0** — Workspace + pluggable driver | ✅ **Done & merged** | Plus follow-up cleanup ([PR #2](https://github.com/Life2death/krishna/pull/2)): all client DB access (incl. `krishna.context.tsx`) now routes through the `@krishna/core` barrel; 8 duplicate `src/lib/database/*.action.ts` files deleted; `audit.action` exported from the core barrel. Verified: `tsc` clean, client 192/192. |
| **Phase 1** — Krishna Brain (Node) + Turso + encryption | ✅ **Done & merged** | [PR #1](https://github.com/Life2death/krishna/pull/1). `apps/brain/` (Fastify + `@libsql/client` + `@napi-rs/keyring`, run via `tsx`). Field encryption verified ciphertext-at-rest; CRUD/auth/WS/`/chat`-guard verified live; brain 7/7. **`/chat` live token streaming still needs a real `ANTHROPIC_API_KEY` in `apps/brain/.env` to verify end-to-end.** Adapter coerces `undefined`→`null` to match Tauri plugin-sql. |
| **Phase 2** — Client remote-brain mode (cross-device sync) | ✅ **Done** | repo-selector + `getRepo()` + RemoteRepo clients + 8 UI hooks + `useBrainWs` + Brain Connection panel. **Orchestrator split-brain FIXED** (commit `466abd7`): `krishna.context.tsx` now routes memory/skills/reminders/conversations/chat through `getRepo()` via `src/lib/repo-bound.ts`; remote `/chat` carries images. Verified: client `tsc` clean + 192/192. *Audit-log + learned-actions intentionally stay local (per-device).* |
| **Phase 3** — MCP tool hub (in the brain) | ✅ **Done** | Brain `McpHub` (connect/list/execute) + `/mcp/tools`, `/mcp/execute`; client `useMcpTools` + `mcp-bridge` registration; `action-policy` `mcp_` safe/sensitive gating in `executor`; core `tool-selector`. *TODO: confirm `mcp_` executions write to audit-log.* |
| **Phase 4** — Mobile clients + voice + handoff | ✅ **Done** | Android `gen/android/` committed; RECORD_AUDIO + MODIFY_AUDIO_SETTINGS in manifest; `MobileVoiceButton` + `useMobileSpeech` (Web Speech API PTT) wired; `useDevicePresence` heartbeat in `KrishnaProvider`; brain `/devices/heartbeat` + `/conversations/:id/resume-summary`; local-provider guards relaxed for remote/keyless mobile mode. iOS deferred (needs Mac). |
| **Phase 5** — Runtime skills + personas | ✅ **Done** | `POST /skills/generate` (brain, generate-only — no premature save); `CreateSkillDialog` (remote-mode UI, user confirms before save); `PersonaSelector` (4 built-in personas); `seedDefaultPersonas` on first `useSystemPrompts` mount; persona prefix prepended to `BASE_SYSTEM_PROMPT` in `KrishnaProvider`. Both client + brain `tsc` clean. Double-save bug fixed (brain no longer persists on generate). |
| **Phase 6** — Post-v1 backlog | ⬜ Pending | Graduate brain to cloud VPS; RAG knowledge base; Telegram bot + daemon mode; dictation mode; secret redaction + auto fact-extraction. |

**Known parked item (low priority):** the legacy `interview_profiles` table is fully removed from
all TS/client code; only 3 historical Rust migrations remain (`src-tauri/src/db/main.rs` versions
3/4/5). They are intentionally **kept** — deleting applied migrations breaks existing installs via
sqlx history validation. The brain already skips them. To physically retire the table, add an
*additive* migration v12 `DROP TABLE IF EXISTS interview_profiles` (needs a Tauri build to verify).

---

## 0. What we're building & why

Krishna today is a **single-machine Tauri 2 desktop assistant** (Rust + React, BYOK LLM/STT, local
SQLite). The goal is to evolve it into a **personal-assistant ecosystem across Android phone, iPhone,
and laptop** — one shared brain, thin clients on every device.

**Why not clone an existing project:** the reference assistants (isair/jarvis, rezaulhreza/jarvis,
Stanford OpenJarvis) are all single-device, local-first, heavy-model (8GB+ VRAM). That collides with
reality — phones can't run those models and the dev box has no GPU. So they're a **feature menu to
borrow from**, not a blueprint. Krishna's edge is the **cross-device layer none of them have**, on a
Tauri codebase that already targets all three platforms from one source.

### Locked decisions
| Decision | Choice |
|---|---|
| Topology | **Brain + thin spokes.** One brain owns memory/skills/tools; thin Krishna clients per device. |
| Brain location (v1) | **Laptop-as-hub**, reachable by phones over a Tailscale tunnel. Move to cloud VPS in Phase 5. |
| Model strategy | **Cloud Claude everywhere** (no GPU). Key held server-side in the brain. |
| Brain runtime | **Node** — reuses Krishna's existing TypeScript `src/lib` near-verbatim. |
| Cloud DB | **Turso / libSQL** — SQLite-native, zero query rewrite. Supabase/Postgres is the fallback. |
| Data security | **App-level field encryption in the brain** (zero-knowledge cloud) + creds/keys never on mobile. |
| v1 capability scope | MCP tool hub · cross-device memory sync · voice everywhere + handoff · runtime skills + personas. |

---

## 1. Target architecture

```
        ┌──────────────────────────────────────────────┐
        │   KRISHNA BRAIN  (headless Node, on the laptop)│
        │   libSQL (Turso) embedded replica:             │
        │     memory · skills · learned-actions ·        │
        │     reminders · chat history                   │
        │   + field encryption  + MCP client hub         │
        │   + model router (Claude)  + auth WS/HTTP API  │
        └───────────────┬──────────────┬─────────────────┘
            Tailscale tunnel (secure, no port-forward)
     ┌──────────────────┼──────────────┼──────────────────┐
     ▼                  ▼              ▼                   ▼
 Laptop client     Android client   iPhone client     [later: web/watch]
 (Tauri desktop)   (Tauri mobile)   (Tauri mobile)
 full perception   voice + camera   voice + Shortcuts
```

Krishna's logic already lives mostly in `src/lib/*` (TypeScript). The brain reuses it. The Tauri app
gains a **remote-brain mode** where it calls the brain API instead of its own local SQLite. Same React
UI, same one codebase, three OS targets.

### The three seams we exploit (verified against the current code)
| Seam | Today | Change |
|---|---|---|
| **Data** | `src/lib/database/*.action.ts` → `getDatabase()` in `database/config.ts` (Tauri `plugin-sql`) | Make `getDatabase()` **pluggable** (inject a `SqlDriver`). Same action files then run in Tauri *and* Node. |
| **Completion** | `src/lib/functions/ai-response.function.ts` `fetchAIResponse()` uses `@tauri-apps/plugin-http` + BYOK curl | Inject the http shim. In the brain it's native `fetch` with the Claude key held server-side. |
| **Consumption** | Hooks (`useMemories`, `useReminders`, …) call action fns directly | Add a `getRepo()` selector → Local (Tauri SQL) or Remote (HTTP→brain) by a `brainMode` flag. |

The existing action-fn signatures (`getAllMemories()`, `createMemory()`, …) already *are* the repository
interface — we formalize it, add a Remote implementation, and reuse the Local one inside the brain.

---

## 2. Storage backend & encryption (Turso / libSQL)

Krishna speaks SQLite, so we pick a **SQLite-native** cloud DB to avoid rewriting every query.

- **Engine: Turso (libSQL)** — wire-compatible with SQLite; drops into the `SqlDriver` seam with **zero
  query rewrite**. Free tier (mid-2026): 5 GB, 100 DBs, 500M row-reads/mo, 10M writes/mo.
- **One driver, both modes:** use `@libsql/client`. Local `file:` DB for dev; add `syncUrl` + `authToken`
  to run as an **embedded replica** (local SQLite file syncing to Turso cloud) — fast local reads + cloud
  durability + multi-device path + trivial Phase-5 cloud-brain move (point it at the same DB).
- **Region:** nearest Turso APAC region (Singapore, or Mumbai if available) — **latency only**. DPDP Act
  2023 does not force India localization for a personal project; the encryption (below) is the real control.
- **Watch-out:** Turso meters *row-reads* (assistant volume is tiny → free tier comfortable). Backend stays
  swappable via `SqlDriver`; **Supabase/Postgres is the fallback** (needs `?`→`$n` rewrite + free-tier idle-pause).

**Security — app-level field encryption is the real protection (provider-independent):**
- Provider AES-256-at-rest only defends against disk theft; the *provider holds the keys*. Wrong threat
  model for personal memories/conversations.
- The brain **encrypts sensitive columns before insert / decrypts after read** (e.g. `memories.value`, chat
  content) with a key the brain holds and Turso never sees → cloud DB is **zero-knowledge** for sensitive
  fields. Keep ids/timestamps plaintext so they stay queryable/sortable.
- **Key custody:** DB creds + encryption key live **only in the brain**, never shipped to mobile (same rule
  as the Claude key). Decide storage of the master key in Phase 1 (OS keychain preferred over plaintext env).
- **Known caveat:** encrypted fields aren't searchable. If Phase 5 RAG/semantic-search over memories is
  wanted, decrypt-in-brain to build the index (don't push plaintext to the cloud).
- TLS in transit (libSQL default). RLS is irrelevant — clients never hit the DB directly; the brain mediates.

---

## 3. Repo restructure (one-time, in Phase 0)

Convert to an **npm workspace** (moves + a driver injection point; no logic rewrite):

```
krishna/
├─ package.json                 # workspaces: ["apps/*", "packages/*"]
├─ packages/
│  └─ core/                     # shared, framework-free (NO React, NO Tauri imports)
│     ├─ types/                 # moved from src/types
│     ├─ database/*.action.ts   # moved as-is
│     ├─ database/driver.ts     # NEW: injectable SqlDriver { select, execute }
│     ├─ tools/  executor.ts  resolver.ts  memory.ts
│     └─ functions/             # prompt building, ai-response (http shim injected)
├─ apps/
│  ├─ client/                   # existing Tauri+React app (src/, src-tauri/)
│  │                            # provides Tauri SqlDriver + plugin-http shim → @krishna/core
│  └─ brain/                    # NEW Node service
│                               # provides libSQL SqlDriver + fetch shim → @krishna/core
```

React hooks/components stay in `apps/client`. `@krishna/core` is import-able by both client and brain.

---

## 4. Phase-by-phase build

> Conventions per phase: **Tasks** (do these), **Reuse** (existing code to lean on), **Verify** (must pass
> before moving on), **Done when** (definition of done). Per the project's *unwired-unit* lesson: after each
> phase, grep the live flow for real call-sites — don't ship modules that pass tests but are never invoked.

### Phase 0 — Workspace + pluggable driver (foundation, zero behavior change)  ✅ DONE
**Tasks**
1. Add root `package.json` (npm workspaces). Create `packages/core`; move `src/types`, `src/lib/database`,
   `src/lib/tools`, `src/lib/executor.ts`, `src/lib/resolver.ts`, `src/lib/memory.ts`, `src/lib/functions/*`
   into it. Fix imports (`@/types` → `@krishna/core/types`, etc.).
2. Add `packages/core/database/driver.ts`:
   ```ts
   export interface SqlDriver {
     select<T>(sql: string, params?: unknown[]): Promise<T>;
     execute(sql: string, params?: unknown[]): Promise<{ rowsAffected: number }>;
   }
   let driver: SqlDriver | null = null;
   export const setDriver = (d: SqlDriver) => { driver = d; };
   export const getDatabase = () => { if (!driver) throw new Error("driver not set"); return driver; };
   ```
   Rewire `database/config.ts`'s `getDatabase()` to return the injected driver. **No `*.action.ts` body
   changes** — they already call `db.select` / `db.execute`.
3. In `apps/client`, register a Tauri `SqlDriver` wrapping `@tauri-apps/plugin-sql` at startup (before any
   DB call). Do the same injectable treatment for the http shim in `ai-response.function.ts` (`setHttpFetch()`),
   defaulting to Tauri's `plugin-http` in the client.

**Reuse:** all `*.action.ts` unchanged; existing Vitest suite as the safety net.
**Verify:** `npm test` green; desktop app builds & runs; memories/skills/reminders work locally as before.
**Done when:** user sees **no functional change**; core is shareable and the DB driver is injectable.

### Phase 1 — Krishna Brain service (Node) + Turso + encryption  ✅ DONE
**Tasks**
1. `apps/brain`: Fastify (HTTP + WebSocket). Add `@libsql/client`.
2. **libSQL `SqlDriver`**: start with a local `file:` DB; flip to **embedded replica** (`syncUrl` +
   `authToken` → Turso, nearest APAC region) once verified. Run existing migrations from
   `src-tauri/src/db/migrations/*.sql` on boot (**LF line-ending gotcha** applies). Call `setDriver()`.
3. **Field-encryption module**: encrypt sensitive columns (`memories.value`, chat content) before insert /
   decrypt after read, applied at the action-fn boundary so it's transparent. Master key from OS keychain
   (fallback env). Ids/timestamps stay plaintext.
4. **REST endpoints** mirroring repo methods per domain: `/memories`, `/skills`, `/learned-actions`,
   `/reminders`, `/chat-history`, `/system-prompts` (GET/POST/DELETE). Handlers just call shared action fns.
5. **Chat endpoint** `POST /chat` (SSE): runs `fetchAIResponse` server-side with the centralized Claude key
   and the Node `fetch` shim; streams tokens back.
6. **Auth** (shared bearer token, checked on every request + WS upgrade) + **WS push** broadcasting
   `{domain, op, row}` on every mutation so clients live-update.
7. Document **Tailscale** setup so phones hit `http://<laptop-tailscale-ip>:PORT` with no port-forward.

**Reuse:** `packages/core` action fns + `fetchAIResponse`; the `.sql` migrations verbatim.
**Verify:** `curl` to create a memory, list it back, stream a `/chat` reply; restart brain → data persisted;
confirm sensitive columns are ciphertext in the raw DB file.
**Done when:** brain serves CRUD + streaming chat over authenticated API, with encrypted sensitive fields.

### Phase 2 — Client remote-brain mode (cross-device memory sync)  ✅ DONE
**Tasks**
1. `apps/client` **RemoteRepo**: one module per domain, **same signatures** as the action fns, implemented as
   `fetch` calls to the brain (bearer token from settings).
2. **`getRepo()` selector**: returns Local (Phase 0 action fns) or Remote by settings `brainMode:
   "local"|"remote"` + `brainUrl` + `brainToken`. Point hooks (`useMemories`, `useLearnedActions`,
   `useReminders`, `useHistory`, `useSystemPrompts`) at `getRepo()`.
3. **Chat routing**: in remote mode `useChatCompletion` calls brain `/chat` SSE; client needs no Claude key.
4. **Live sync**: subscribe to brain WS; on push, call the hook's existing `fetch*` refresher.
5. Settings UI: a "Brain connection" panel (URL, token, test-connection).

**Reuse:** existing hooks & their `fetch*` refreshers; existing settings storage.
**Verify:** laptop client (remote mode) writes a memory → second client/`curl` sees it instantly via WS;
close laptop UI → brain keeps serving.
**Done when:** memory/skills are shared across any client pointed at the brain.

### Phase 3 — MCP tool hub (in the brain)  ✅ DONE
**Tasks**
1. Add `@modelcontextprotocol/sdk` (client) to the brain. Config lists MCP servers (Gmail, Calendar, GitHub,
   Notion, Home Assistant, DBs). Connect on boot, keep sessions warm, idle-timeout unused ones.
2. **Discovery → executor**: surface MCP tools through Krishna's existing tool/executor path
   (`packages/core/tools`, `executor.ts`) so the LLM calls them like native tools.
3. **Tool-subset selection** (borrow isair): keyword + embedding ranking to avoid context rot.
4. **Safety**: extend `src/config/action-policy.ts` `classifyAction()` to tag MCP tools safe/sensitive;
   sensitive calls round-trip a **confirmation request** to the originating client; log to existing `audit-log`.

**Reuse:** `tools/`, `executor.ts`, `resolver.ts`, `action-policy.ts`, existing confirmation flow + audit log.
**Verify:** connect one MCP server (GitHub or filesystem), ask a question needing it from a client → tool runs
in the brain; a sensitive action prompts for confirmation and is audited.
**Done when:** Krishna can use external MCP tools with safe/sensitive gating.

### Phase 4 — Mobile clients + voice everywhere + handoff  🚧 IN PROGRESS (Android-first)
**Decision (2026-06-20): ship Android first; iOS deferred** — iOS needs macOS + Xcode (not buildable on
this Windows box). Brain-side device presence + resume-summary already built; mobile target now scaffolded.

**Tasks**
1. **Tauri mobile** — ✅ **Android `init` DONE.** Toolchain was already on the machine (Android Studio + SDK
   + NDK `28.2.13676358`); only env wiring was missing. Set up 2026-06-20:
   - Persisted (User env): `JAVA_HOME=C:\Program Files\Android\Android Studio\jbr`,
     `NDK_HOME`/`ANDROID_NDK_HOME=...\Sdk\ndk\28.2.13676358` (`ANDROID_HOME` was already set).
   - Added Rust targets: `aarch64`/`armv7`/`i686`/`x86_64-linux-android`.
   - Ran `npx tauri android init` → `src-tauri/gen/android/` generated (identifier `com.krishna.assistant`).
   - **`gen/android/` is untracked** — commit it (you'll hand-edit `AndroidManifest.xml` for `RECORD_AUDIO`).
   - ⚠️ A shell/agent session started **before** the env vars were persisted won't see them — restart the
     session, or `export JAVA_HOME`/`NDK_HOME` in-session, before running gradle/`tauri android dev`.
   - iOS `init` deferred (needs a Mac). Reuse icon sets in `src-tauri/icons/android`. Mobile defaults to
     `brainMode: "remote"`.
2. **Voice**: Android — VAD + wake word (`KrishnaVAD.tsx`, `wake-word.ts`) where supported. **iOS** —
   background mic is restricted → **push-to-talk** + a **Shortcuts/share-sheet** entry point (documented
   limitation, not a blocker). TTS via existing per-OS speaker path; mobile falls back to `speechSynthesis`.
3. **Device presence + handoff**: clients register (`POST /devices/heartbeat`); brain keeps a presence table.
   On wake-word, clients report capture confidence; brain **arbitrates** (most-recent/loudest wins) and routes
   the reply to the chosen device only.
4. **Resume-summary (cross-device compaction)** — *optimization, not the transport.* Mid-conversation
   laptop↔phone switching is already **lossless by architecture**: the brain owns the conversation, so the
   other device just reads the same chat history. This task adds an *optional* compaction layer for when the
   full transcript is too big/expensive for a thin or token-limited mobile model:
   - `POST /conversations/:id/resume-summary` → brain returns a compact "where we are" digest (recent turns +
     a rolling summary of older ones + a **suggested next-actions/skills** line so the resuming device knows
     *intent*, not just text). **Redact** secrets/PII before it leaves the brain.
   - The mobile client requests this instead of the full history when a conversation exceeds a token budget;
     otherwise it reads the conversation directly (default).
   - Pattern reference (compaction prompt skeleton only, *not* the mechanism — Krishna has a shared brain, so
     it doesn't pass documents between stateless sessions): mattpocock/skills `productivity/handoff`. Same
     "memory digest for small models" idea isair/jarvis uses. Composes with the Phase 5 RAG/memory-hardening work.

**Reuse:** `KrishnaVAD.tsx`, `wake-word.ts`, per-OS speaker path, existing Tauri mobile icon assets; the
chat-history store + `fetchAIResponse` for generating the digest.
**Verify:** wake word near two devices → exactly one answers and speaks there; start a task on phone, continue
it on laptop (shared brain state makes this automatic); for a long conversation, the resume-summary returns a
bounded digest with a redacted, intent-carrying next-step.
**Done when:** Android + iOS thin clients run against the brain with voice and clean handoff; long
conversations resume on mobile via a bounded, redacted summary.

### Phase 5 — Runtime skills + personas (+ post-v1 backlog)  ⬜ PENDING
**Tasks**
1. **Runtime skill creation**: `POST /skills/generate` — LLM emits a **declarative** skill recipe (ordered
   tool calls + prompt template) as JSON validated against the existing `Skill` type, stored via
   `skills.action.ts`. **No arbitrary code-gen** (safety). Instantly runnable on all devices via shared brain.
2. **Personas**: promote `system-prompts` into named personas (default / coder / researcher / planner) with
   tone + tool-bias; per-conversation selector; brain applies the persona's system prompt + tool filter.

**Reuse:** `skills.action.ts` + `Skill` type; `useSystemPrompts` + `system-prompt.action.ts`.
**Verify:** create a skill on the phone, invoke it from the laptop; switch persona → tone + available tools change.
**Done when:** Krishna creates skills on request and switches personas, synced across devices.

**Post-v1 backlog (later):** graduate the brain to an always-on cloud VPS (same Turso DB); RAG knowledge base
(decrypt-in-brain to index); Telegram bot + daemon mode; dictation mode; secret redaction + auto fact-extraction.

---

## 5. Cross-cutting requirements

### ⛔ STRICT Definition of Done — live-wiring proof (MANDATORY Phase 5 onward)
Phases 0, 2, and 3 each shipped code that passed typecheck/tests and demoed correctly but left the
**live flow unwired** (Phase 0 duplicate action files; Phase 2 orchestrator bypassing `getRepo`). From
**Phase 5 onward this is a hard gate** — a phase is NOT done until the agent proves the new code is on the
real path, not just present in the repo. The DoD report for each phase MUST include:

1. **Call-path trace**: name the entry point (`krishna.context.tsx` for the assistant flow, the relevant
   route for the brain) and show the chain from there to the new code. "It's imported / a hook uses it" is
   NOT sufficient — the *orchestrator* and the *brain route* are the live paths.
2. **Grep evidence**: paste the `grep` showing the new module is invoked from the live flow, AND a grep
   showing the **old path is gone** (no lingering direct calls / duplicate files bypassing the new seam).
3. **Negative test**: disable the new code (or point it at a bad endpoint) and show the live feature
   actually breaks — proving it was on the path, not dead code shadowed by an old route.
4. **End-to-end run**, not just unit tests: exercise the feature through the real UI/voice/brain path and
   report observed behavior (the unit suite passing is necessary, not sufficient).

If any of the four is missing, the phase is **in progress**, not done. Reviewer rejects on a missing trace.

- **Tests**: keep Vitest in `packages/core`; add brain integration tests (supertest vs Fastify). Each phase:
  grep the live flow for real call-sites (unwired-unit guard) — see the strict DoD above.
- **Security**: bearer token minimum; Claude key, DB creds, and encryption key live only in the brain — never
  shipped to mobile. Sensitive MCP tools always confirm. Audit-log every tool execution.
- **Migrations**: brain and Tauri share the same `.sql` files — keep them **LF** and idempotent.
- **Backwards compat**: `brainMode: "local"` stays the default for solo desktop use; the ecosystem is opt-in.

## 6. Open questions to settle during Phase 0/1 (don't block the start)
- Workspace tool: plain **npm workspaces** (assumed) vs pnpm.
- Master encryption-key storage: OS keychain (preferred) vs passphrase-unlock vs env.
- Sync conflict policy: **last-write-wins** (fine for single user across devices) — confirm.
- iPhone distribution: dev sideload (fast iteration) → TestFlight later.

## 7. Suggested first PR
Phase 0 only — it's pure refactor with the existing test suite as a safety net and **zero user-visible change**.
Land it green before any brain code exists.
