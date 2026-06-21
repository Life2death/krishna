import { describe, it, expect, beforeAll } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { createClient, type Client } from "@libsql/client";
import { setDriver, getAllMemories, createAuditEntry } from "@krishna/core";
import { runMigrations } from "../src/db/migrations.ts";
import { makeFieldCrypto } from "../src/crypto/field-crypto.ts";
import { Hub } from "../src/ws.ts";
import { authHook } from "../src/auth.ts";
import { memoriesRoutes } from "../src/routes/memories.ts";
import { mcpToolsRoutes } from "../src/routes/mcp-tools.ts";
import type { ToolResult } from "../../../packages/core/tools/index";

const TOKEN = "test-token";
const KEY = Buffer.alloc(32, 7);

// Inline driver (mirrors src/db/libsql-driver.ts) so the test doesn't pull in
// config.ts env requirements. Includes the same undefined->null coercion.
function inlineDriver(client: Client) {
  const args = (p?: unknown[]) => (p ?? []).map((x) => (x === undefined ? null : x)) as never[];
  return {
    select: async <T,>(sql: string, p?: unknown[]) =>
      (await client.execute({ sql, args: args(p) })).rows as unknown as T,
    execute: async (sql: string, p?: unknown[]) => {
      const r = await client.execute({ sql, args: args(p) });
      return {
        rowsAffected: r.rowsAffected,
        lastInsertId: r.lastInsertRowid != null ? Number(r.lastInsertRowid) : undefined,
      };
    },
  };
}

describe("field-crypto", () => {
  const c = makeFieldCrypto(KEY);

  it("round-trips and marks ciphertext", () => {
    const ct = c.encrypt("hello secret")!;
    expect(ct.startsWith("enc:v1:")).toBe(true);
    expect(ct).not.toContain("hello secret");
    expect(c.decrypt(ct)).toBe("hello secret");
  });

  it("passes through null/undefined", () => {
    expect(c.encrypt(null)).toBeNull();
    expect(c.decrypt(undefined)).toBeUndefined();
  });

  it("never double-encrypts and treats legacy plaintext as-is", () => {
    const ct = c.encrypt("x")!;
    expect(c.encrypt(ct)).toBe(ct); // idempotent
    expect(c.decrypt("legacy-plaintext")).toBe("legacy-plaintext");
  });

  it("rejects a non-32-byte key", () => {
    expect(() => makeFieldCrypto(Buffer.alloc(16))).toThrow();
  });
});

describe("memories route (encryption boundary + auth)", () => {
  let app: FastifyInstance;
  let client: Client;

  beforeAll(async () => {
    client = createClient({ url: ":memory:" });
    await runMigrations(client);
    setDriver(inlineDriver(client) as never);
    app = Fastify();
    app.addHook("preHandler", authHook(TOKEN));
    memoriesRoutes(app, { crypto: makeFieldCrypto(KEY), hub: new Hub(), db: client });
    await app.ready();
  });

  const auth = { authorization: `Bearer ${TOKEN}` };
  const mem = {
    id: "m1",
    key: "favorite_color",
    value: "indigo is the secret",
    source: "explicit",
    confirmed: 1,
    createdAt: 1,
    lastUsedAt: null,
  };

  it("rejects unauthenticated requests", async () => {
    const res = await app.inject({ method: "GET", url: "/memories" });
    expect(res.statusCode).toBe(401);
  });

  it("creates and reads back decrypted", async () => {
    const post = await app.inject({ method: "POST", url: "/memories", headers: auth, payload: mem });
    expect(post.statusCode).toBe(200);

    const get = await app.inject({ method: "GET", url: "/memories", headers: auth });
    expect(get.json()[0].value).toBe("indigo is the secret");
  });

  it("stores the value as ciphertext at rest, key in plaintext", async () => {
    const rows = await getAllMemories(); // raw rows (still encrypted)
    expect(rows[0].value.startsWith("enc:v1:")).toBe(true);
    expect(rows[0].value).not.toContain("indigo");
    expect(rows[0].key).toBe("favorite_color"); // key not encrypted -> queryable
  });
});

describe("MCP gate (server-side confirmation)", () => {
  let app: FastifyInstance;

  // Minimal mock McpHub that always returns a single tool and succeeds on call
  const mockHub = {
    getAllTools: () => [
      { name: "delete_everything", description: "A destructive test tool", serverName: "test", inputSchema: {} },
    ],
    callTool: async (_name: string, _args: Record<string, unknown>): Promise<ToolResult> => {
      return { success: true, output: "executed" };
    },
  };

  beforeAll(async () => {
    app = Fastify();
    app.addHook("preHandler", authHook(TOKEN));
    mcpToolsRoutes(app, mockHub as never);
    await app.ready();
  });

  const auth = { authorization: `Bearer ${TOKEN}` };

  it("rejects sensitive MCP tool without confirmed: true (403)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/mcp/execute",
      headers: auth,
      payload: { tool: "delete_everything", args: {} },
    });
    expect(res.statusCode).toBe(403);
    const body = res.json();
    expect(body.category).toBe("sensitive");
    expect(body.success).toBe(false);
  });

  it("executes sensitive MCP tool with confirmed: true (200)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/mcp/execute",
      headers: auth,
      payload: { tool: "delete_everything", args: {}, confirmed: true },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});
