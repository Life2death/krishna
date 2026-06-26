import type { FastifyInstance } from "fastify";
import type { BrainContext } from "../context.ts";
import { config } from "../config.ts";
import { isRagReady, getStore } from "../rag/index.ts";
import { getSyncStatus } from "../db/sync-status.ts";
import type { McpHub } from "../mcp/hub.ts";

interface StatusSection {
  ok: boolean;
  [key: string]: unknown;
}

// Cache the Gmail token decryption so we don't hit the OS keyring + argon2
// on every 15s poll. TTL of 60s; re-auth clears it (old token is invalidated).
let gmailTokenCache: { token: unknown; ts: number } | null = null;
const GMAIL_CACHE_TTL = 60_000;

export function statusRoutes(
  app: FastifyInstance,
  ctx: BrainContext,
  mcpHub?: McpHub,
): void {
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

    // Gmail — cached token decryption
    try {
      const now = Date.now();
      if (!gmailTokenCache || now - gmailTokenCache.ts > GMAIL_CACHE_TTL) {
        const { loadToken } = await import("../gmail/token-store");
        const { makeFieldCrypto } = await import("../crypto/field-crypto.ts");
        const { loadMasterKey } = await import("../crypto/keyring.ts");
        const crypto = makeFieldCrypto(await loadMasterKey());
        const token = config.gmailTokenPath
          ? await loadToken(config.gmailTokenPath, crypto)
          : null;
        gmailTokenCache = { token, ts: now };
      }
      const tok = gmailTokenCache.token as any;
      const hasRefreshToken = !!(tok?.refresh_token);
      sections.gmail = {
        ok: hasRefreshToken,
        configured: !!config.gmailOAuthKeysPath,
        tools: hasRefreshToken ? 4 : 0,
        tokenPresent: !!tok,
        hasRefreshToken,
        expired: !hasRefreshToken,
        expiryDate: null, // access-token expiry is routine (auto-refreshed)
        error: tok && !hasRefreshToken ? "Missing refresh token — re-run gmail:auth" : undefined,
      };
    } catch {
      gmailTokenCache = null;
      sections.gmail = {
        ok: false,
        configured: !!config.gmailOAuthKeysPath,
        tools: 0,
        tokenPresent: false,
        hasRefreshToken: false,
        expired: true,
        error: "gmail init failed",
      };
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
      sections.rag = {
        ok: false,
        enabled: !config.ragDisabled,
        error: err instanceof Error ? err.message : String(err),
      };
    }

    // AI
    sections.ai = {
      ok: !!config.anthropicApiKey,
      provider: "anthropic",
      keyConfigured: !!config.anthropicApiKey,
      model: config.claudeModel,
    };

    // MCP — real tool count from the hub
    sections.mcp = {
      ok: !!mcpHub,
      tools: mcpHub?.getAllTools().length ?? 0,
    };

    // Voice ID
    try {
      const { createVoiceStore } = await import("../voice-id/store.ts");
      const store = createVoiceStore(ctx.db, ctx.crypto);
      const vp = await store.getVoiceprint();
      sections.voiceId = {
        ok: true,
        enrolled: vp !== null,
        sampleCount: vp?.sampleCount ?? 0,
        dims: vp?.dims ?? 0,
      };
    } catch (err) {
      sections.voiceId = {
        ok: false,
        enrolled: false,
        error: err instanceof Error ? err.message : String(err),
      };
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
      sections.data = {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }

    return sections;
  });

  // Force sync
  app.post("/status/sync", async () => {
    const { syncAndRecord, getSyncStatus } = await import("../db/sync-status.ts");
    await syncAndRecord(ctx.db);
    const s = getSyncStatus();
    return { synced: s.lastSyncOk, lastSyncOk: s.lastSyncOk, lastError: s.lastError };
  });
}
