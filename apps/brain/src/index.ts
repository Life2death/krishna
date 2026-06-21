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

async function main(): Promise<void> {
  // 1. Boot shared core onto the Node runtime (libSQL driver + migrations + shims).
  const db = await initCore();

  // 2. Field encryption key (OS keyring or env).
  const crypto = makeFieldCrypto(await loadMasterKey());

  // 3. Live-sync hub + shared context.
  const hub = new Hub();
  const ctx: BrainContext = { crypto, hub, db };

  // 3b. MCP tool hub — connect to configured MCP servers.
  const mcpHub = new McpHub();
  mcpHub.setWsHub(hub);
  const mcpConfig = loadMcpConfig();
  if (mcpConfig.servers.length > 0) {
    await mcpHub.connectAll(mcpConfig.servers);
    console.log(`[mcp] Connected to ${mcpConfig.servers.length} MCP server(s), ${mcpHub.getAllTools().length} tools total`);
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

  // REST domains.
  memoriesRoutes(app, ctx);
  skillsRoutes(app, ctx);
  learnedActionsRoutes(app, ctx);
  remindersRoutes(app, ctx);
  systemPromptsRoutes(app, ctx);
  chatHistoryRoutes(app, ctx);
  chatRoutes(app);
  mcpToolsRoutes(app, mcpHub);
  devicesRoutes(app, ctx);
  resumeSummaryRoutes(app, ctx);
  skillsGenerateRoutes(app);

  await app.listen({ port: config.port, host: "0.0.0.0" });
  app.log.info(`Krishna Brain listening on :${config.port}`);
}

main().catch((err) => {
  console.error("Brain failed to start:", err);
  process.exit(1);
});
