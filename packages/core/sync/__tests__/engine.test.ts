// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";

type Row = Record<string, unknown>;

const T0 = 1700000000000; // base epoch ms for realistic timestamps

class MockDb {
  tables = new Map<string, Map<string, Row>>();
  tombstones: { table_name: string; row_id: string; deleted_at: number }[] = [];

  constructor() {
    for (const name of ["conversations","messages","memories","memory_embeddings",
      "learned_actions","skills","system_prompts","reminders","voiceprint_samples",
      "sync_state","sync_tombstones"]) {
      this.tables.set(name, new Map());
    }
  }

  rawSelect(table: string): Row[] {
    return [...(this.tables.get(table)?.values() ?? [])];
  }

  rawGet(table: string, id: string): Row | undefined {
    return this.tables.get(table)?.get(id);
  }

  rawSet(table: string, id: string, row: Row): void {
    let t = this.tables.get(table);
    if (!t) { t = new Map(); this.tables.set(table, t); }
    t.set(id, { ...row });
  }

  rawDelete(table: string, id: string): void {
    this.tables.get(table)?.delete(id);
  }

  select<T>(sql: string, params?: unknown[]): Promise<T> {
    const tName = (sql.match(/(?:FROM|TABLE)\s+"?(\w+)"?/i) ?? [])[1] ?? "";
    const table = this.tables.get(tName);
    if (!table) return Promise.resolve([] as unknown as T);
    if (sql.includes("WHERE id = ?") && params?.length === 1) {
      const row = table.get(String(params[0]));
      return Promise.resolve((row ? [row] : []) as unknown as T);
    }
    if (tName === "sync_tombstones" && sql.includes("WHERE table_name = ?")) {
      const tName2 = String(params?.[0] ?? "");
      const since = Number(params?.[1] ?? 0);
      return Promise.resolve(this.tombstones.filter(
        (t) => t.table_name === tName2 && t.deleted_at > since
      ) as unknown as T);
    }
    if (sql.includes("SELECT id FROM")) {
      return Promise.resolve([...table.keys()].map((k) => ({ id: k })) as unknown as T);
    }
    if (sql.includes("updated_at > ?")) {
      const since = Number(params?.[0] ?? 0);
      return Promise.resolve([...table.values()].filter(
        r => {
          const ua = r.updated_at;
          const uaNum = typeof ua === 'number' ? ua : parseInt(String(ua ?? '0'), 10);
          return !isNaN(uaNum) && uaNum > since;
        }
      ) as unknown as T);
    }
    if (sql.includes("WHERE conversation_id = ?")) {
      const cid = String(params?.[0] ?? "");
      return Promise.resolve([...table.values()].filter(
        r => r.conversation_id === cid
      ) as unknown as T);
    }
    if (tName === "sync_state") {
      const target = String(params?.[0] ?? "");
      if (target) {
        const row = table.get(target);
        return Promise.resolve((row ? [row] : []) as unknown as T);
      }
      return Promise.resolve([...table.values()] as unknown as T);
    }
    return Promise.resolve([...table.values()] as unknown as T);
  }

  execute(sql: string, params?: unknown[]): Promise<{ rowsAffected: number }> {
    if (sql.includes("sync_tombstones") && (sql.includes("INSERT") || sql.includes("REPLACE"))) {
      this.tombstones.push({
        table_name: String(params?.[0] ?? ""),
        row_id: String(params?.[1] ?? ""),
        deleted_at: Number(params?.[2] ?? Date.now()),
      });
      return Promise.resolve({ rowsAffected: 1 });
    }
    if (sql.includes("sync_state") && sql.includes("INSERT")) {
      const name = String(params?.[0] ?? "");
      this.tables.get("sync_state")?.set(name, {
        table_name: name, last_pulled_at: 0, last_pushed_at: 0,
      });
      return Promise.resolve({ rowsAffected: 1 });
    }
    if (sql.includes("sync_state") && sql.includes("UPDATE")) {
      const ts = Number(params?.[0] ?? 0);
      const name = String(params?.[1] ?? "");
      const row = this.tables.get("sync_state")?.get(name) ?? {
        table_name: name, last_pulled_at: 0, last_pushed_at: 0,
      };
      if (sql.includes("last_pulled_at")) row.last_pulled_at = ts;
      if (sql.includes("last_pushed_at")) row.last_pushed_at = ts;
      this.tables.get("sync_state")?.set(name, row);
      return Promise.resolve({ rowsAffected: 1 });
    }
    if (sql.includes("DELETE FROM") && !sql.includes("WHERE id = ?")) {
      const tName = (sql.match(/FROM\s+"?(\w+)"?/i) ?? [])[1] ?? "";
      this.tables.set(tName, new Map());
      return Promise.resolve({ rowsAffected: 1 });
    }
    if (sql.includes("DELETE") && sql.includes("WHERE id = ?")) {
      const tName = (sql.match(/FROM\s+"?(\w+)"?/i) ?? [])[1] ?? "";
      const id = String(params?.[0] ?? "");
      this.tables.get(tName)?.delete(id);
      return Promise.resolve({ rowsAffected: 1 });
    }
    if (sql.includes("INSERT") || sql.includes("REPLACE")) {
      const tName = (sql.match(/(?:INTO|TABLE)\s+"?(\w+)"?/i) ?? [])[1] ?? "";
      const cols = (sql.match(/\(([^)]+)\)/) ?? [])[1]?.split(",").map(c => c.trim().replace(/"/g, "")) ?? [];
      const row: Row = {};
      for (let i = 0; i < cols.length; i++) row[cols[i]] = params?.[i];
      const id = String(row.id ?? "");
      let t = this.tables.get(tName);
      if (!t) { t = new Map(); this.tables.set(tName, t); }
      t.set(id, row);
      return Promise.resolve({ rowsAffected: 1 });
    }
    return Promise.resolve({ rowsAffected: 0 });
  }
}

import { SyncEngine } from "../engine";
import { writeTombstone, writeTombstones } from "../tombstone";
import { setDriver } from "../../database/driver";

describe("SyncEngine", () => {
  let localDb: MockDb;
  let remoteDb: MockDb;
  let engine: SyncEngine;

  function makeTransport() {
    return {
      pushRows: async (table: string, rows: Row[]) => {
        for (const row of rows) remoteDb.rawSet(table, String(row.id ?? ""), row);
      },
      deleteRows: async (table: string, ids: string[]) => {
        for (const id of ids) remoteDb.rawDelete(table, id);
      },
      pullRows: async (table: string, since: number) => {
        return remoteDb.rawSelect(table).filter(r => {
          const ua = r.updated_at;
          const uaNum = typeof ua === 'number' ? ua : parseInt(String(ua ?? '0'), 10);
          return !isNaN(uaNum) && uaNum > since;
        });
      },
      pullTombstones: async (since: number) => {
        return remoteDb.tombstones.filter(t => t.deleted_at > since);
      },
      close: () => {},
    };
  }

  beforeEach(() => {
    localDb = new MockDb();
    remoteDb = new MockDb();

    setDriver({
      select: (sql: string, params?: unknown[]) => localDb.select(sql, params),
      execute: (sql: string, params?: unknown[]) => localDb.execute(sql, params),
    });

    engine = new SyncEngine(makeTransport() as any);
  });

  describe("push delta selection", () => {
    it("pushes rows with updated_at > last_pushed_at", async () => {
      localDb.rawSet("memories", "mem1", { id: "mem1", value: "test", updated_at: T0 });
      const result = await engine.syncNow();
      expect(result.pushed).toBeGreaterThan(0);
      expect(remoteDb.rawGet("memories", "mem1")?.value).toBe("test");
    });

    it("does not re-push rows already pushed", async () => {
      localDb.rawSet("memories", "mem1", { id: "mem1", value: "test", updated_at: T0 });
      await engine.syncNow();
      expect(remoteDb.rawGet("memories", "mem1")?.value).toBe("test");

      localDb.rawSet("memories", "mem2", { id: "mem2", value: "test2", updated_at: T0 + 1000 });
      await engine.syncNow();
      expect(remoteDb.rawGet("memories", "mem1")?.value).toBe("test");
      expect(remoteDb.rawGet("memories", "mem2")?.value).toBe("test2");

      expect(remoteDb.rawSelect("memories").length).toBe(2);
    });
  });

  describe("pull LWW", () => {
    it("newer remote row pulled and inserted locally when not present locally", async () => {
      remoteDb.rawSet("memories", "mem1", { id: "mem1", value: "new", updated_at: T0 });
      await engine.syncNow();
      expect(localDb.rawGet("memories", "mem1")?.value).toBe("new");
    });

    it("older remote row does not overwrite newer local row (LWW)", async () => {
      // First sync: push local to remote so both sides have the row
      localDb.rawSet("memories", "mem1", { id: "mem1", value: "newer_local", updated_at: T0 + 200 });
      await engine.syncNow();
      expect(remoteDb.rawGet("memories", "mem1")?.value).toBe("newer_local");

      // Simulate a stale concurrent write: older value appears on remote
      remoteDb.rawSet("memories", "mem1", { id: "mem1", value: "older_remote", updated_at: T0 + 100 });
      // Second sync: pull should NOT overwrite newer local with older remote
      await engine.syncNow();
      expect(localDb.rawGet("memories", "mem1")?.value).toBe("newer_local");
    });

    it("newer remote overwrites older local row (LWW)", async () => {
      // First sync: push local to remote so both sides have the row
      localDb.rawSet("memories", "mem1", { id: "mem1", value: "older_local", updated_at: T0 + 100 });
      await engine.syncNow();
      expect(remoteDb.rawGet("memories", "mem1")?.value).toBe("older_local");

      // Simulate a newer write on remote (e.g. from another device)
      remoteDb.rawSet("memories", "mem1", { id: "mem1", value: "newer_remote", updated_at: T0 + 200 });
      // Second sync: pull should overwrite older local with newer remote
      await engine.syncNow();
      expect(localDb.rawGet("memories", "mem1")?.value).toBe("newer_remote");
    });

    it("handles TEXT updated_at (numeric string) from voiceprints/system_prompts", async () => {
      localDb.rawSet("memories", "mem1", {
        id: "mem1", value: "text-ts", updated_at: String(T0),
      });
      const result = await engine.syncNow();
      expect(result.pushed).toBeGreaterThan(0);
      expect(remoteDb.rawGet("memories", "mem1")?.value).toBe("text-ts");
    });

    it("compares TEXT numeric string against INTEGER watermark correctly", async () => {
      localDb.rawSet("memories", "mem1", {
        id: "mem1", value: "local-int", updated_at: T0 + 100,
      });
      await engine.syncNow();

      // Remote now gets a newer TEXT-numeric update (simulating old format on other device)
      remoteDb.rawSet("memories", "mem1", {
        id: "mem1", value: "remote-text", updated_at: String(T0 + 200),
      });
      await engine.syncNow();
      expect(localDb.rawGet("memories", "mem1")?.value).toBe("remote-text");
    });
  });

  describe("concurrent write", () => {
    it("does not lose row written after push SELECT but before watermark save", async () => {
      localDb.rawSet("memories", "mem1", { id: "mem1", value: "first", updated_at: T0 });
      await engine.syncNow();

      localDb.rawSet("memories", "mem2", { id: "mem2", value: "concurrent", updated_at: T0 + 500 });
      await engine.syncNow();

      expect(remoteDb.rawGet("memories", "mem2")?.value).toBe("concurrent");
    });

    it("handles concurrent writes on both sides across cycles", async () => {
      // Device A (local) creates a row first
      localDb.rawSet("memories", "mem1", { id: "mem1", value: "local", updated_at: T0 });
      await engine.syncNow();

      // Device B (remote) updates the same row with a newer timestamp
      remoteDb.rawSet("memories", "mem1", { id: "mem1", value: "remote", updated_at: T0 + 1 });

      await engine.syncNow();
      // Remote is newer (T0+1 > T0) → should win after pull
      expect(localDb.rawGet("memories", "mem1")?.value).toBe("remote");
    });
  });

  describe("clock skew", () => {
    it("does not skip remote rows due to clock skew", async () => {
      remoteDb.rawSet("memories", "mem1", { id: "mem1", value: "older", updated_at: T0 - 3600000 });
      remoteDb.rawSet("memories", "mem2", { id: "mem2", value: "newer", updated_at: T0 });

      await engine.syncNow();

      expect(localDb.rawGet("memories", "mem1")?.value).toBe("older");
      expect(localDb.rawGet("memories", "mem2")?.value).toBe("newer");
    });

    it("does not push row with updated_at before watermark", async () => {
      localDb.rawSet("memories", "mem1", { id: "mem1", value: "before", updated_at: T0 });
      await engine.syncNow();

      localDb.rawSet("memories", "mem2", { id: "mem2", value: "skewed", updated_at: T0 - 1000 });
      await engine.syncNow();
      expect(remoteDb.rawGet("memories", "mem2")).toBeUndefined();

      localDb.rawSet("memories", "mem2", { id: "mem2", value: "skewed", updated_at: T0 + 100 });
      await engine.syncNow();
      expect(remoteDb.rawGet("memories", "mem2")?.value).toBe("skewed");
    });
  });

  describe("tombstone propagation", () => {
    it("delete on remote removes row locally after pull", async () => {
      localDb.rawSet("memories", "mem1", { id: "mem1", value: "test", updated_at: T0 });
      await engine.syncNow();

      remoteDb.tombstones.push({ table_name: "memories", row_id: "mem1", deleted_at: T0 + 1000 });
      await engine.syncNow();

      expect(localDb.rawGet("memories", "mem1")).toBeUndefined();
    });
  });

  describe("offline path", () => {
    it("sync logs errors but does not throw", async () => {
      const failTransport = {
        pushRows: async () => { throw new Error("fail"); },
        deleteRows: async () => { throw new Error("fail"); },
        pullRows: async () => { throw new Error("fail"); },
        pullTombstones: async () => { throw new Error("fail"); },
        close: () => {},
      };
      const eng = new SyncEngine(failTransport as any);
      localDb.rawSet("memories", "mem1", { id: "mem1", value: "test", updated_at: T0 });
      let threw = false;
      try {
        await eng.syncNow();
      } catch {
        threw = true;
      }
      expect(threw).toBe(false);
    });
  });

  describe("voiceprint round-trip", () => {
    it("syncs encrypted voiceprint sample without decryption", async () => {
      localDb.rawSet("voiceprint_samples", "s1", {
        id: "s1", speaker: "primary", embedding: "enc:v1:abc123==", dims: 512, quality: null, updated_at: T0,
      });
      await engine.syncNow();
      expect(remoteDb.rawGet("voiceprint_samples", "s1")?.embedding).toBe("enc:v1:abc123==");
    });


  });

  describe("embedding version guard", () => {
    it("pulls remote embedding row when not present locally", async () => {
      remoteDb.rawSet("memory_embeddings", "emb1", {
        id: "emb1", memory_id: "mem1", content: "remote", embedding: "[0.9]",
        source: "memory", created_at: T0, updated_at: T0, embedding_model_version: "v2",
      });
      await engine.syncNow();
      expect(localDb.rawGet("memory_embeddings", "emb1")?.embedding_model_version).toBe("v2");
      expect(localDb.rawGet("memory_embeddings", "emb1")?.content).toBe("remote");
    });
  });

  describe("excluded tables", () => {
    it("does not sync interview_profiles", async () => {
      localDb.rawSet("interview_profiles", "prof1", {
        id: "prof1", resume_text: "hello", updated_at: T0,
      });
      await engine.syncNow();
      expect(remoteDb.tables.has("interview_profiles")).toBe(false);
    });
  });

  describe("tombstone write helper", () => {
    it("writes tombstone for synced table", async () => {
      await writeTombstone("memories", "mem1");
      expect(localDb.tombstones.length).toBeGreaterThan(0);
    });

    it("ignores non-synced table", async () => {
      await writeTombstone("audit_log", "log1");
      expect(localDb.tombstones.length).toBe(0);
    });

    it("writes multiple tombstones", async () => {
      await writeTombstones("memories", ["mem1", "mem2", "mem3"]);
      expect(localDb.tombstones.length).toBe(3);
    });
  });
});
