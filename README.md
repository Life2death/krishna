# Krishna

<div align="center">

[![Open Source](https://img.shields.io/badge/Open%20Source-GPL%20v3-green?style=for-the-badge)](LICENSE)
[![Built with Tauri](https://img.shields.io/badge/Built%20with-Tauri%202-orange?style=for-the-badge&logo=tauri)](https://tauri.app/)
[![React](https://img.shields.io/badge/Client-React%20%2B%20TypeScript-blue?style=for-the-badge&logo=react)](https://reactjs.org/)
[![Brain](https://img.shields.io/badge/Brain-Node%20%2B%20libSQL-339933?style=for-the-badge&logo=node.js)](apps/brain)
[![Platforms](https://img.shields.io/badge/Platforms-Windows%20%C2%B7%20macOS%20%C2%B7%20Linux%20%C2%B7%20Android-D4AF37?style=for-the-badge)](#supported-platforms)

> **A voice-first AI assistant** — talk to it, it talks back, and it acts.
> Growing from a single desktop app into a **cross-device personal-assistant ecosystem**:
> one shared brain, thin Krishna clients on every device.

</div>

---

## What is Krishna?

Krishna is a **talking desktop AI assistant**. It lives as a small always-on-top bar — speak to it
and it answers out loud, opens apps / websites / files, transcribes audio, analyzes screenshots,
remembers things across sessions, runs reusable skills, and calls external tools over MCP.

It's built on **Tauri 2 (Rust + React)**, so one codebase targets desktop *and* mobile. Krishna is
evolving from a single-machine app into an **ecosystem**: a headless **Krishna Brain** (Node) owns
memory, skills, tools, and chat history, while thin Krishna clients on laptop and Android sync through
it. Full design in [KRISHNA_ECOSYSTEM_PLAN.md](./KRISHNA_ECOSYSTEM_PLAN.md).

Free and open source under **GPL v3**.

---

## Architecture

```
        ┌──────────────────────────────────────────────┐
        │   KRISHNA BRAIN  (headless Node, on a host)   │
        │   libSQL (Turso) embedded replica:            │
        │     memory · skills · reminders · chat        │
        │   + field encryption  + MCP tool hub          │
        │   + Claude model router  + auth WS/HTTP API   │
        └───────────────┬──────────────┬────────────────┘
            Tailscale tunnel (secure, no port-forward)
     ┌──────────────────┼──────────────┼──────────────────┐
     ▼                  ▼              ▼                   ▼
 Laptop client     Android client   [iOS — later]    [web/watch — later]
 (Tauri desktop)   (Tauri mobile)
```

- **One shared brain** holds memory/skills/tools and the Claude key — never shipped to mobile.
- **App-level field encryption** in the brain means the cloud DB is *zero-knowledge* for sensitive
  fields (memory values, chat content). Ids/timestamps stay plaintext so they remain queryable.
- The desktop client runs in **local mode** (BYOK, local SQLite — works solo, no brain needed) or
  **remote mode** (calls the brain). The ecosystem is opt-in; solo desktop is the default.

### Repository layout

| Path | What it is |
|---|---|
| `apps/client` (`src/`, `src-tauri/`) | The Tauri desktop/mobile app — React UI + Rust shell |
| `apps/brain` | Headless Node service (Fastify + `@libsql/client`) |
| `packages/core` | Shared, framework-free logic — DB actions, tools, AI, types, redaction |

---

## Features

| Feature | Description |
|---|---|
| **Voice everywhere** | Wake word, voice-activity detection, push-to-talk; speaks replies via the per-OS TTS path |
| **Acts on your machine** | Opens apps, websites, and files by voice |
| **Live transcription** | Capture mic or system audio, transcribe via your STT provider |
| **AI answers** | Streams from Claude (brain) or any BYOK provider on desktop |
| **Screenshot analysis** | Capture a region or full screen and send it to the model |
| **Cross-device sync** | Memory, skills, and reminders shared across any client via the brain |
| **MCP tool hub** | Connect external MCP servers; safe/sensitive gating with confirmation + audit log |
| **Runtime skills** | Generate declarative skill recipes on request (no arbitrary code-gen) |
| **Personas** | Switch tone + tool-bias (default / coder / researcher / planner) per conversation |
| **RAG knowledge base** | Local embeddings for semantic memory search |
| **Telegram bot + dictation** | Chat with Krishna from Telegram; dedicated dictation endpoint |
| **Privacy by design** | Field encryption + pattern-based secret/PII redaction before content leaves the brain |

---

## Supported platforms

| Platform | Status |
|---|---|
| Windows 10 / 11 | Supported (primary desktop target) |
| macOS 12+ | Supported |
| Linux | Supported |
| Android | Supported (Tauri mobile; defaults to remote/brain mode) |
| iOS | Deferred — needs macOS + Xcode to build |

---

## Install

### Download

Grab the latest build from the [Releases page](https://github.com/Life2death/krishna/releases)
(`.msi` / `.exe` for Windows, `.apk` for Android).

### Build from source

**Prerequisites:** [Node.js](https://nodejs.org/) v20+, [Rust](https://rustup.rs/) (stable),
and the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for your OS.

```bash
git clone https://github.com/Life2death/krishna.git
cd krishna
npm install

# Desktop app (dev)
npm run tauri dev

# Production build → src-tauri/target/release/bundle/
npm run tauri build
```

### Run the Brain (optional — for cross-device sync)

```bash
cd apps/brain
cp .env.example .env          # set ANTHROPIC_API_KEY, an auth TOKEN, and Turso creds
npm run dev
```

Then point a client at it from the desktop app's **Brain Connection** settings panel (URL + token).
For phones, expose the brain over a [Tailscale](https://tailscale.com/) tunnel — no port-forwarding.

---

## AI & STT providers

The **brain** uses **Claude** (key held server-side). The **desktop client** is BYOK — bring your own
key for any provider via the Dev Space:

- **LLM:** Anthropic Claude, OpenAI, Google Gemini, xAI Grok, Mistral, Groq, Ollama, Perplexity,
  Cohere, or any OpenAI-compatible endpoint.
- **STT:** OpenAI/Groq Whisper, ElevenLabs, Deepgram, Azure Speech, Google STT, IBM Watson, or any
  REST STT API.

---

## Privacy

- Sensitive fields are **encrypted in the brain** (AES-256-GCM) before they ever reach the cloud DB.
- DB creds, the encryption key, and the Claude key live **only in the brain** — never on mobile.
- Secret/PII **redaction** runs before content leaves the brain (resume summaries, Telegram, etc.).
- Solo desktop mode keeps everything **local** in SQLite with no external server.

---

## Contributing

Contributions welcome — bug fixes, provider presets, mobile/desktop polish, MCP integrations.

1. Fork the repo
2. Create a feature branch (`git checkout -b fix/your-fix`)
3. Commit (`git commit -m "fix: description"`)
4. Push and open a Pull Request

---

## License

Licensed under the **GNU General Public License v3.0** — see [LICENSE](LICENSE).

---

## Acknowledgments

- **[Tauri](https://tauri.app/)** — desktop + mobile app framework
- **[Turso / libSQL](https://turso.tech/)** — SQLite-native cloud database
- **[Model Context Protocol](https://modelcontextprotocol.io/)** — external tool integration
- **[shadcn/ui](https://ui.shadcn.com/)** — UI components
- **[@ricky0123/vad-react](https://github.com/ricky0123/vad)** — voice activity detection

---

<div align="center">

**Free. Open Source. Voice-first.**

[Issues](https://github.com/Life2death/krishna/issues) · [Discussions](https://github.com/Life2death/krishna/discussions) · [Releases](https://github.com/Life2death/krishna/releases)

For a file-by-file breakdown, see [PROJECT_STRUCTURE.md](./PROJECT_STRUCTURE.md).

</div>
