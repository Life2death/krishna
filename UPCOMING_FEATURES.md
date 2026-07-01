# Krishna — Upcoming Features (backlog / candidates)

A running list of candidate features and architectural upgrades under consideration.
Items here are **not yet committed plans** — they capture the idea, why it matters, a
rough feasibility read, and open questions, so we can promote them to a real phase plan
when ready. Newest theme at the top.

---

## Theme: peerd-inspired upgrades

Source & rationale: analysis of **peerd** (https://peerd.ai, https://github.com/NotASithLord/peerd,
Apache-2.0, v0.x). peerd is a browser-native AI agent harness whose *philosophy* mirrors
Krishna (local-first, BYOK, no backend, client-side crypto, agent + subagents + memory),
but whose *form factor* is the opposite (browser extension vs native voice-first Tauri app).
Decision: **do NOT fuse/merge** (different runtimes, and Krishna's native + voice-first +
cross-device identity is its moat). Instead **harvest peerd's ideas** (license permits) and
keep peerd on the radar as a complementary browser surface to bridge to later once it
stabilizes past v0.x. The items below are the harvest.

### 1. "Lethal trifecta" security separation for tool execution  ⭐ high value
**What:** Adopt peerd's structural isolation for the agent's tool/command loop. A *keyless*
disposable runner reads/handles untrusted content (web pages, email bodies, tool output,
scraped text); the *main* agent that holds credentials never processes raw untrusted content
directly; a single egress chokepoint enforces a provider allowlist + open-web denylist +
SSRF guard.
**Why:** Krishna is adding more powerful tools (Gmail read/send, computer-use, MCP, web
fetch). Today the credentialed agent processes raw tool output directly — the exact "lethal
trifecta" (private data + untrusted content + network) peerd is designed to contain. This is
a genuine security upgrade over the current model.
**How (Krishna fit):** Introduce a keyless "reader/summarizer" sub-agent that wraps untrusted
input and returns typed, sanitized summaries to the main agent; route all outbound calls
through one `safeFetch`-style chokepoint with an allowlist (already partially present via the
CSP connect-src list + brain-out-of-path work).
**Feasibility:** Medium — architectural, TS-side, no new heavy deps. Composes with the
existing tool-selector / MCP bridge.
**Open questions:** How to keep latency low with an extra summarizer hop for voice UX; which
tools are "untrusted-input" (Gmail, web, file reads) vs safe.

### 2. Sandboxed compute inside the Tauri webview  ⭐ high value
**What:** Give Krishna a safe code-execution capability — a **sealed Web Worker + OPFS**
"notebook" sandbox (peerd's `Notebook` primitive) for running agent-authored JS with file
storage, isolated from the main app.
**Why:** Unlocks agent-built tools, data crunching, and reusable workflows without giving the
agent raw access to the app/host. Big capability jump for "do things," not just "say things."
**How (Krishna fit):** Web Worker with OPFS, message-passed tool API, no network unless via
the chokepoint (item 1). **Explicitly skip peerd's CheerpX WASM Linux VM** — it's proprietary
(commercial license for orgs/production). A sealed Worker gets ~80% of the value for free; a
WASM Linux VM can be revisited only if there's a clear need and licensing is acceptable.
**Feasibility:** Medium. Web Worker + OPFS are standard; the work is the tool bridge + sandbox
boundary. Fits Krishna's existing webview.
**Open questions:** Persistence/cleanup of OPFS artifacts; how sandboxed apps surface results
back into the voice/chat flow.

### 3. Precise in-browser tab/DOM control (alternative to pixel-level computer-use)
**What:** For web tasks, drive the browser via DOM-aware control rather than OS-level
pixel clicking (which Krishna does today via computer-use).
**Why:** More reliable and faster for web workflows; less brittle than screen coordinates.
**How (Krishna fit):** Likely via an MCP browser tool / extension bridge rather than porting
peerd itself. Lower priority than 1 & 2; overlaps existing computer-use.
**Feasibility:** Medium-low — needs a browser bridge; peerd exposes no external API to reuse.
**Open questions:** Whether to invest here vs improving computer-use; extension dependency.

### 4. Watch: P2P agent-to-agent (WebRTC) for device-to-device handoff
**What:** peerd's `dweb` module does agent-to-agent comms over WebRTC via a signaling server.
Potentially relevant to Krishna's multi-device / mobile-hub ambitions (desktop ↔ Android).
**Why:** Could enable direct device-to-device agent handoff without round-tripping cloud.
**Status:** **Watch only.** peerd's dweb is explicitly research-grade / preview. It does NOT
replace Krishna's durable sync layer (local SQLite + custom delta-sync → Turso). Revisit if
peerd's P2P matures and a concrete device-handoff use case emerges.

### Cross-cutting notes / cautions
- **License:** peerd is Apache-2.0 — idea-level and code-level reuse is permitted (with
  attribution). CheerpX (its Linux VM) is proprietary — avoid unless licensed.
- **Runtime mismatch:** peerd is vanilla ES2024 JS in an MV3 extension; Krishna is TS + Rust +
  Tauri. Reuse is idea-level, not drop-in.
- **Sequencing:** Do NOT start these until Phase 2 sync + the voice-ID gallery fixes are
  landed and clean. These are post-Phase-2/3 candidates, not a mid-flight pivot.
- **Don't fuse:** keep Krishna native + voice-first + cross-device; treat peerd as a reference
  architecture and a possible future *complementary* browser surface, not a merge target.

---

<!-- Add new feature themes above this line. Keep each item: What / Why / How / Feasibility / Open questions. -->
