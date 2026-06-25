import type { FastifyInstance } from "fastify";
import type { BrainContext } from "../context.ts";
import { config } from "../config.ts";
import { isRagReady, getStore } from "../rag/index.ts";
import { getSyncStatus } from "../db/sync-status.ts";

interface StatusSection {
  ok: boolean;
  [key: string]: unknown;
}

export function statusRoutes(app: FastifyInstance, ctx: BrainContext): void {
  app.get("/status", async () => {
    const sections: Record<string, StatusSection> = {};

    // Brain
    sections.brain = { ok: true, version: "1.0.0", uptimeSec: Math.floor(process.uptime()), clients: ctx.hub.size };

    // DB
    try {
      await ctx.db.execute("SELECT 1");
      sections.db = { ok: true, path: config.dbPath };
    } catch (err) {
      sections.db = { ok: false, error: err instanceof Error ? err.message : String(err) };
    }

    // Sync
    const sync = getSyncStatus();
    sections.sync = {
      ok: sync.enabled ? (sync.lastSyncOk || sync.lastSyncAt === null) : true,
      enabled: sync.enabled,
      host: sync.host,
      intervalSec: sync.intervalSec,
      lastSyncAt: sync.lastSyncAt,
      lastSyncOk: sync.lastSyncOk,
      lastError: sync.lastError,
    };

    // Gmail
    try {
      const { loadToken } = await import("../gmail/token-store");
      const { makeFieldCrypto } = await import("../crypto/field-crypto.ts");
      const { loadMasterKey } = await import("../crypto/keyring.ts");
      const crypto = makeFieldCrypto(await loadMasterKey());
      const token = config.gmailTokenPath ? await loadToken(config.gmailTokenPath, crypto) : null;
      sections.gmail = {
        ok: !!token,
        configured: !!config.gmailOAuthKeysPath,
        tools: token ? 4 : 0,
        tokenPresent: !!token,
        expiryDate: token?.expiry_date ?? null,
        expired: token ? (token.expiry_date ?? 0) < Date.now() : false,
      };
    } catch {
      sections.gmail = { ok: false, configured: !!config.gmailOAuthKeysPath, tools: 0, tokenPresent: false, error: "gmail init failed" };
    }

    // RAG
    try {
      if (config.ragDisabled) {
        sections.rag = { ok: true, enabled: false, ready: false };
      } else {
        const ready = isRagReady();
        let count = 0;
        if (ready) {
          try {
            const store = getStore();
            count = await store.count();
          } catch {}
        }
        sections.rag = { ok: true, enabled: true, ready, embeddings: count };
      }
    } catch (err) {
      sections.rag = { ok: false, enabled: !config.ragDisabled, error: err instanceof Error ? err.message : String(err) };
    }

    // AI
    sections.ai = {
      ok: !!config.anthropicApiKey,
      provider: "anthropic",
      keyConfigured: !!config.anthropicApiKey,
      model: config.claudeModel,
    };

    // MCP
    try {
      const { McpHub } = await import("../mcp/index.ts");
      sections.mcp = { ok: true, tools: 0 };
    } catch {
      sections.mcp = { ok: false, tools: 0 };
    }

    // Data counts
    try {
      const memCount = await ctx.db.execute("SELECT COUNT(*) as c FROM memories");
      const convCount = await ctx.db.execute("SELECT COUNT(*) as c FROM conversations");
      const remCount = await ctx.db.execute("SELECT COUNT(*) as c FROM reminders");
      const learnCount = await ctx.db.execute("SELECT COUNT(*) as c FROM learned_actions");
      const skillCount = await ctx.db.execute("SELECT COUNT(*) as c FROM skills");
      sections.data = {
        ok: true,
        memories: Number((memCount.rows[0] as any).c),
        conversations: Number((convCount.rows[0] as any).c),
        reminders: Number((remCount.rows[0] as any).c),
        learnedActions: Number((learnCount.rows[0] as any).c),
        skills: Number((skillCount.rows[0] as any).c),
      };
    } catch (err) {
      sections.data = { ok: false, error: err instanceof Error ? err.message : String(err) };
    }

    return sections;
  });

  // Force sync
  app.post("/status/sync", async () => {
    const { syncAndRecord } = await import("../db/sync-status.ts");
    await syncAndRecord(ctx.db);
    return { synced: true };
  });
}
