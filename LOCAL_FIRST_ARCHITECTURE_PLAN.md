# Krishna — Local-First Architecture Plan (re-segregation)

> **For the implementing agent.** This re-establishes Krishna's intended architecture after the voice
> feature accidentally put a Node "brain" in the runtime critical path. **Read the Principles first —
> every task is judged against them.** Confirmed with the owner 2026-06-28.

## The one-line goal
The **laptop works fully offline-of-cloud** (only outbound call = Anthropic). **Cloud is pure backup +
the sync hub for a mobile companion** — never a runtime dependency. **Voice-ID runs client-side.**

## Principles (non-negotiable)
1. **Local-first:** the desktop must do chat, memories, conversations, and voice-ID with **no internet
   except the Anthropic API call.** Pull the LAN cable and everything except "ask the LLM" still works.
2. **No brain in the critical path:** the Node `apps/brain` process must NOT be required for the desktop
   to function. Chat goes app→Anthropic directly; memories live in the app's own local DB.
3. **Cloud = optional backup + sync hub:** Turso/cloud only (a) mirrors memories for disaster-recovery
   restore, and (b) is the shared store the **mobile** reads/writes ("Krishna, follow me"). The app must
   run 100% with cloud unconfigured/unreachable. All cloud I/O is **background, write-behind, non-blocking.**
4. **Graceful degradation:** any optional capability (cloud sync, Gmail, MCP, RAG) absent ⇒ core still works.

## The three tiers

### Tier 1 — Laptop (primary, local-first core)
| Concern | Where it lives |
|---|---|
| LLM / chat | **Client → `api.anthropic.com` directly** (BYOK key in OS keychain/secure storage). Never via a brain. Default mode = local. |
| Memory / conversations / system-prompts / learned-skills / reminders | **Local DB = source of truth** (read/write instant, offline). |
| Voice-ID (speaker verification) | **In-app** — WavLM (`Xenova/wavlm-base-plus-sv`) via transformers.js in the webview (WASM/WebGPU) or a Rust ONNX runtime. Voiceprint (512-d vector) stored locally. Cosine compare is trivial client-side. |
| Cloud sync | **Background daemon, in-process, async** — write-behind push + periodic pull of memory deltas. Never blocks UI or startup. |

### Tier 2 — Cloud (optional backup + sync hub) — NEVER in the laptop critical path
- A managed store (Turso/libsql primary, or equivalent) holding the **encrypted** memory/voiceprint mirror.
- Purposes: **disaster recovery** (restore a fresh laptop) + **shared store for mobile**.
- The laptop treats it as write-behind backup + occasional pull. Unconfigured/offline ⇒ app unaffected.

### Tier 3 — Mobile (Android/iOS companion) — for when away from the laptop
| Concern | Where |
|---|---|
| LLM / chat | Client → Anthropic directly (its own BYOK key). |
| Memory | Reads/writes the **cloud store** (+ a local cache). When online, same memories as the laptop. |
| Voice-ID | Client-side (synced voiceprint). Mobile model port is heavier — may defer past v1. |
| Device control | The existing Android plugin work (separate track; see `ANDROID_ACL_PERMISSIONS_FIX.md`). |

## Retire the Node brain from the laptop runtime — responsibility remap
The desktop **must stop spawning/depending on `apps/brain`** for core features (`src-tauri/src/brain.rs`
spawn + the `remote` repo path). Each current brain responsibility gets a new home:

| Brain does today | New home |
|---|---|
| `/chat` (holds Anthropic key) | **Client direct** (local repo `fetchAIResponse` via `tauriFetch`). Key in client secure storage. |
| Memories + Turso embedded-replica | **Client local DB** = truth; **client-side background sync** to cloud (see Sync below). |
| Voice-ID (`/voice/*`, WavLM) | **Client-side** model + local voiceprint. Delete the brain `/voice/*` dependency. |
| RAG (embeddings/search) | **Optional, client-side** (transformers.js embeddings) — or defer; must not block core. |
| Gmail (4 tools) | **Relocate client-side** — see §Gmail & MCP below. |
| MCP tools | **Relocate client-side** — see §Gmail & MCP below. |
| Telegram bot | **Optional cloud-only** feature; not part of local-first. |

> End state: there is **no required Node brain on the laptop.** If any server remains, it is only the
> cloud sync target (possibly just Turso directly, with **no custom server at all**).

## Gmail & MCP — VERIFIED current state and target (the heaviest relocation)
**Verified 2026-06-28** (don't re-investigate from scratch — file refs below):

**Good news (already client-side, keep as-is):**
- Krishna does **NOT** use Anthropic native tool-use. The model emits Krishna's own ```action / ```plan
  text blocks; the client parses them (`src/lib/actions.ts:7-61`) and **executes plans client-side**
  (`packages/core/executor.ts:21-104`, tool registry + `${var}` substitution). So no native-`tools`
  rework is needed, and the orchestration loop is already on the client.
- The **sensitive-action confirmation gate is already client-side** in the MCP bridge
  (`packages/core/tools/mcp-bridge.ts:39-50` — `classifyAction`, sensitive ⇒ confirm).

**What's brain-bound today (must move):**
- **MCP hub executes in the brain.** `apps/brain/src/mcp/hub.ts` (`McpHub.connectAll`/`callTool`) connects
  to MCP servers and runs tool calls; the client only **wraps** them — `useMcpTools.ts` fetches
  `GET /mcp/tools` and `buildMcpBridgeTools()` makes each tool `run()` **POST to brain `/mcp/execute`**
  (`apps/brain/src/routes/mcp-tools.ts`).
- **Gmail is a brain built-in MCP provider** — `apps/brain/src/gmail/{tools,client,token-store}.ts`
  (googleapis + OAuth + encrypted token), registered into `McpHub` at boot. Its 4 tools
  (`gmail_search_messages`, `gmail_read_message`, `gmail_list_labels`, `gmail_send_email`) run brain-side.
- **Tools only load in REMOTE mode** — `useMcpTools.ts:35-39` returns early unless `brainMode === "remote"`.
  So in local mode there are **zero tools today** (`fetchAIResponse` is text-only).

**Target (client-side, local-first):**
- **In-app MCP hub/client** inside Tauri: stdio MCP servers spawned via the Tauri **shell** plugin (run
  **fully local/offline**); remote (URL) MCP servers over HTTP (online, as they must be). Port `McpHub`'s
  connect/list/call to Rust (an MCP client crate) or the TS MCP SDK in the app.
- **Gmail client-side:** Tauri does the Google **OAuth** (open-browser + capture redirect; token in the OS
  keychain), then calls the **Gmail REST API directly via `tauriFetch`** — reimplement the 4 tools without
  `googleapis`/the brain. **Send stays confirmation-gated**, and **wire the currently-missing send
  confirmation** (known gap: `MCP_CONFIRMATION_HANDOFF.md`).
- **Bridge calls local, not the brain:** change `buildMcpBridgeTools()` so `run()` invokes the **local**
  hub (a Tauri command) instead of POSTing `/mcp/execute`; load tools in **local mode** (drop the
  remote-only guard). Keep the client-side `classifyAction` confirm gate.
- **Reality check:** Gmail and remote-MCP are **online by nature** — they need internet, brain or not.
  Local-first just means they require **no Krishna brain** and **never block** the offline core. Local
  (stdio) MCP servers keep working offline.

## Memory store & sync model (the key technical enabler)
- **Local store of record:** a sync-capable embedded DB. The Tauri `sql` plugin (sqlx/SQLite) does **not**
  do libsql replica sync — so adopt one of:
  - **(preferred)** the Rust **`libsql`** crate as an embedded replica in the Tauri core (local file =
    reads/writes; `.sync()` to Turso in the background), exposed to the frontend via commands; **or**
  - keep local SQLite + a **custom delta-sync layer** (per-row `updated_at`, push/pull changed rows).
- **Reads/writes always hit the local replica** → instant + offline. **Sync is background + non-blocking.**
- **Conflict resolution:** single user across devices ⇒ low conflict. Use **last-write-wins per row by
  `updated_at`** (or libsql's native sync). Tombstones for deletes.
- **Encryption:** memories/voiceprint encrypted with the **one shared `KRISHNA_MASTER_KEY`** before they
  touch the local DB or the cloud (existing rule — see `brain-master-key-custody`). The master key must be
  provisioned to each device (secure entry / QR pairing) so mobile can decrypt synced data. Changing the
  key orphans rows — design the pairing flow, don't regenerate per device.

## Phased rollout (each phase independently shippable)
- **Phase 0 — Restore local-first chat+memory (do first; this is "stable desktop").**
  Force the desktop to the **local repo by default**: chat = direct Anthropic, memories/conversations =
  local DB. Verify **with the brain NOT running**: launch app, send a message → answer; create/read a
  memory → works; dashboard populates from local DB. Remove the startup hard-dependency on the brain
  (stop blocking on `spawn_dev/spawn_bundled`).
- **Phase 1 — Client-side voice-ID.** Port WavLM into the app (transformers.js in the webview, or Rust
  ONNX). Local voiceprint store. Enroll/verify with **no brain**. Delete brain `/voice/*` calls from the
  client. Graceful: if the model isn't downloaded yet, voice-ID disables; core unaffected.
- **Phase 2 — Cloud backup + sync (optional).** Implement the local-replica/background-sync layer
  (above). Write-behind to Turso; pull on interval; **restore-from-cloud** flow for a fresh laptop. All
  opt-in; app fully works without it. (This is where `REMOTE_CLOUD_BRAIN_FIX.md`'s Turso/Fly notes feed in
  — but the cloud is a **sync target, not a runtime brain**.)
- **Phase 3 — Mobile companion (Android first).** Direct Anthropic + cloud-store memories + master-key
  pairing + client-side voice-ID (or deferred). Fold in the device-control plugin work.
- **Phase 4 — Relocate Gmail + MCP client-side, then retire the brain.** Per §Gmail & MCP: stand up the
  in-app MCP hub (stdio via shell plugin = local; URL = remote), reimplement Gmail as Tauri-OAuth + direct
  REST, repoint the bridge to the local hub, enable tools in local mode, and wire the missing send-confirm.
  RAG goes client-side or is deferred. After this, the Node brain is gone from the laptop (or survives only
  as the optional cloud sync service).

## Open design decisions to resolve in Phase 0/2 (flag, don't guess)
1. **libsql-in-Rust vs custom delta-sync** for the local-replica + cloud-sync layer (recommend libsql crate).
2. **Master-key cross-device provisioning** (QR pairing vs manual secure entry).
3. **RAG**: client-side embeddings vs defer — RAG is currently brain-side and heavy; decide if v1 needs it.
4. **Gmail/MCP**: client-side Tauri implementation vs keep as optional add-ons.

## Acceptance test for "done" (Phase 0, the immediate bar)
1. Quit/kill any brain. Launch the desktop. **Send a chat message → get an Anthropic answer.**
2. Create a memory, restart the app (no brain) → the memory persists and is readable.
3. Open the dashboard → conversations render from the **local** DB (no `:8787` calls in the console).
4. Pull the network (leave only Anthropic reachable) → all of the above still works except it correctly
   reports when the LLM itself is unreachable.

See also: `claude28thjune.md` (today's diagnosis: brain-startup hang, Anthropic-reachable correction),
`brain-master-key-custody`, `REMOTE_CLOUD_BRAIN_FIX.md` (Turso/Fly — now repurposed as Tier-2 sync, not a brain).
