import Fastify from "fastify";
import websocket, { type WebSocket } from "@fastify/websocket";
import { config } from "./config.ts";
import { initCore } from "./core-init.ts";
import { loadMasterKey } from "./crypto/keyring.ts";
import { makeFieldCrypto } from "./crypto/field-crypto.ts";
import { Hub } from "./ws.ts";
import { authHook } from "./auth.ts";
import type { BrainContext } from "./context.ts";
import { memoriesRoutes } from "./routes/memories.ts";
import { skillsRoutes } from "./routes/skills.ts";
import { learnedActionsRoutes } from "./routes/learned-actions.ts";
import { remindersRoutes } from "./routes/reminders.ts";
import { systemPromptsRoutes } from "./routes/system-prompts.ts";
import { chatHistoryRoutes } from "./routes/chat-history.ts";
import { chatRoutes } from "./routes/chat.ts";
import { McpHub, loadMcpConfig } from "./mcp/index.ts";
import { mcpToolsRoutes } from "./routes/mcp-tools.ts";
import { devicesRoutes } from "./routes/devices.ts";
import { resumeSummaryRoutes } from "./routes/resume-summary.ts";
import { skillsGenerateRoutes } from "./routes/skills-generate.ts";
import { dictateRoutes } from "./routes/dictate.ts";
import { factExtractRoutes } from "./routes/fact-extract.ts";
import { ragRoutes } from "./routes/rag.ts";
import { initRag } from "./rag/index.ts";
import { startBot, stopBot as stopTelegramBot } from "./telegram/bot.ts";

async function main(): Promise<void> {
  // 1. Boot shared core onto the Node runtime (libSQL driver + migrations + shims).
  const db = await initCore();

  // 2. Field encryption key (OS keyring or env).
  const crypto = makeFieldCrypto(await loadMasterKey());

  // 3. Live-sync hub + shared context.
  const hub = new Hub();
  const ctx: BrainContext = { crypto, hub, db };

  // 3a. Sync status tracker (for /status endpoint + shutdown).
  const { initSyncStatus } = await import("./db/sync-status");
  initSyncStatus();

  // 3b. MCP tool hub — connect to configured MCP servers.
  const mcpHub = new McpHub();
  mcpHub.setWsHub(hub);
  const mcpConfig = loadMcpConfig();
  if (mcpConfig.servers.length > 0) {
    await mcpHub.connectAll(mcpConfig.servers);
    console.log(`[mcp] Connected to ${mcpConfig.servers.length} MCP server(s), ${mcpHub.getAllTools().length} tools total`);
  }

  // 3c. Built-in Gmail provider (read-only + send) — register if token file exists.
  const gmailTokenPath = config.gmailTokenPath;
  const gmailKeysPath = config.gmailOAuthKeysPath;
  if (gmailTokenPath && gmailKeysPath) {
    try {
      const { loadToken, saveToken } = await import("./gmail/token-store");
      const { loadOAuthKeys, createGmailClient } = await import("./gmail/client");
      const { createGmailProvider } = await import("./gmail/tools");

      const tokens = await loadToken(gmailTokenPath, crypto);
      if (tokens) {
        const keys = await loadOAuthKeys(gmailKeysPath);
        const gmail = await createGmailClient(tokens, keys, async (updated) => {
          await saveToken(updated, gmailTokenPath, crypto);
        });
        const provider = createGmailProvider(gmail);
        mcpHub.registerBuiltin(provider);
        console.log(`[gmail] Read-only + send tools registered (${provider.tools.length} tools)`);
      } else {
        console.log("[gmail] No token found — skipping. Run `npm run gmail:auth` to authorize.");
      }
    } catch (err) {
      console.error("[gmail] Failed to initialize:", err);
    }
  }

  const app = Fastify({ logger: true });
  await app.register(websocket);
  app.addHook("preHandler", authHook(config.token));

  app.get("/health", async () => ({ ok: true, ts: Date.now(), clients: hub.size }));

  // WebSocket push channel — token via ?token= (browsers can't set WS headers).
  app.get("/ws", { websocket: true }, (socket: WebSocket, req) => {
    const token = new URL(req.url, "http://brain").searchParams.get("token");
    if (token !== config.token) {
      socket.close(1008, "unauthorized");
      return;
    }
    hub.add(socket);
  });

  // RAG knowledge base (async init — non-blocking).
  if (!config.ragDisabled) {
    initRag(ctx).catch((err) => console.error("[rag] Init failed:", err));
  } else {
    console.log("[rag] Disabled via config");
  }

  // Graceful shutdown — sync DB to Turso, stop Telegram polling, then Fastify.
  const shutdown = async () => {
    app.log.info("Shutting down…");
    await stopTelegramBot();
    const { syncAndRecord } = await import("./db/sync-status");
    await syncAndRecord(db);
    await app.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Shutdown endpoint — allows Tauri to request graceful shutdown (runs sync-to-Turso).
  app.post("/shutdown", async () => {
    app.log.info("Received shutdown request via HTTP");
    shutdown().catch((err) => app.log.error(err, "Shutdown error"));
    return { ok: true };
  });

  // REST domains.
  memoriesRoutes(app, ctx);
  skillsRoutes(app, ctx);
  learnedActionsRoutes(app, ctx);
  remindersRoutes(app, ctx);
  systemPromptsRoutes(app, ctx);
  chatHistoryRoutes(app, ctx);
  chatRoutes(app);
  mcpToolsRoutes(app, mcpHub);
  const { statusRoutes } = await import("./routes/status");
  statusRoutes(app, ctx, mcpHub);
  devicesRoutes(app, ctx);
  resumeSummaryRoutes(app, ctx);
  factExtractRoutes(app, ctx);
  skillsGenerateRoutes(app);
  dictateRoutes(app);
  ragRoutes(app, ctx);

  // Telegram bot (optional — only polls when TELEGRAM_BOT_TOKEN is set).
  const telegramBot = await startBot(ctx);
  if (telegramBot) {
    app.log.info("Telegram bot polling");
  }

  await app.listen({ port: config.port, host: "127.0.0.1" });
  app.log.info(`Krishna Brain listening on :${config.port}`);

}

main().catch((err) => {
  console.error("Brain failed to start:", err);
  process.exit(1);
});
