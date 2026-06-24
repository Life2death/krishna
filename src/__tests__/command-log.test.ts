import { describe, it, expect, beforeEach, vi } from "vitest";
import { getDatabase } from "@krishna/core/database/driver";
import {
  insertPendingCommand,
  updateCommandOutcome,
  getCommandStats,
  getRecentActivity,
} from "@/lib/database";

const mockDb = () => getDatabase() as unknown as {
  select: ReturnType<typeof vi.fn>;
  execute: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("insertPendingCommand", () => {
  it("inserts a row with outcome='pending'", async () => {
    const db = mockDb();
    db.execute.mockResolvedValue({ rowsAffected: 1 });

    await insertPendingCommand({
      id: "test-id-1",
      transcript: "open chrome",
      source: "voice",
      createdAt: 1700000000000,
    });

    expect(db.execute).toHaveBeenCalledTimes(1);
    const [sql, params] = db.execute.mock.calls[0];
    expect(sql).toContain("INSERT INTO command_log");
    expect(sql).toContain("'pending'");
    expect(params[0]).toBe("test-id-1");
    expect(params[1]).toBe("open chrome");
    expect(params[2]).toBe("voice");
    expect(params[3]).toBe(1700000000000);
  });
});

describe("updateCommandOutcome", () => {
  it("updates a pending row to answered", async () => {
    const db = mockDb();
    db.execute.mockResolvedValue({ rowsAffected: 1 });

    await updateCommandOutcome({
      id: "test-id-1",
      outcome: "answered",
      response: "Opening Chrome",
    });

    expect(db.execute).toHaveBeenCalledTimes(1);
    const [sql, params] = db.execute.mock.calls[0];
    expect(sql).toContain("UPDATE command_log");
    expect(sql).toContain("SET outcome=");
    expect(params[0]).toBe("answered");
    expect(params[1]).toBeNull();
    expect(params[2]).toBeNull();
    expect(params[3]).toContain("Opening Chrome");
    expect(params[4]).toBe("test-id-1");
  });

  it("updates a pending row to failed with reason", async () => {
    const db = mockDb();
    db.execute.mockResolvedValue({ rowsAffected: 1 });

    await updateCommandOutcome({
      id: "test-id-2",
      outcome: "failed",
      failureReason: "tool_failed",
      detail: "Failed to open nonexistent app",
    });

    expect(db.execute).toHaveBeenCalledTimes(1);
    const [, params] = db.execute.mock.calls[0];
    expect(params[0]).toBe("failed");
    expect(params[1]).toBe("tool_failed");
    expect(params[2]).toContain("Failed to open");
  });

  it("falls back to INSERT when rowsAffected is 0", async () => {
    const db = mockDb();
    // First call returns 0 rows affected (no pending row to update)
    // Second call is the fallback INSERT
    db.execute
      .mockResolvedValueOnce({ rowsAffected: 0 })
      .mockResolvedValueOnce({ rowsAffected: 1 });

    await updateCommandOutcome({
      id: "orphaned-id",
      outcome: "answered",
      response: "Hello",
    });

    expect(db.execute).toHaveBeenCalledTimes(2);
    expect(db.execute.mock.calls[0][0]).toContain("UPDATE");
    expect(db.execute.mock.calls[1][0]).toContain("INSERT INTO command_log");
  });
});

describe("getCommandStats", () => {
  it("excludes pending and ignored from total, reports pending count", async () => {
    const db = mockDb();
    db.select
      // First query: outcome group by
      .mockResolvedValueOnce([
        { outcome: "answered", count: 5 },
        { outcome: "failed", count: 2 },
        { outcome: "declined", count: 1 },
        { outcome: "ignored", count: 3 },
        { outcome: "pending", count: 1 },
      ])
      // Second query: failure reason breakdown
      .mockResolvedValueOnce([
        { failure_reason: "tool_failed", count: 1 },
        { failure_reason: "ai_error", count: 1 },
      ]);

    const stats = await getCommandStats();

    expect(stats.total).toBe(8); // 5 + 2 + 1 (not 3 ignored, not 1 pending)
    expect(stats.answered).toBe(5);
    expect(stats.failed).toBe(2);
    expect(stats.declined).toBe(1);
    expect(stats.pending).toBe(1);
    expect(stats.byReason).toHaveLength(2);
    expect(stats.byReason[0].reason).toBe("tool_failed");
  });

  it("returns zeros when no rows exist", async () => {
    const db = mockDb();
    db.select.mockResolvedValue([]);

    const stats = await getCommandStats();

    expect(stats.total).toBe(0);
    expect(stats.answered).toBe(0);
    expect(stats.failed).toBe(0);
    expect(stats.declined).toBe(0);
    expect(stats.pending).toBe(0);
    expect(stats.byReason).toHaveLength(0);
  });
});

describe("getRecentActivity", () => {
  it("returns all rows without outcome filter", async () => {
    const db = mockDb();
    db.select.mockResolvedValue([
      { id: "1", transcript: "hello", outcome: "pending", failure_reason: null, detail: null, response: null, source: "voice", created_at: 1000 },
      { id: "2", transcript: "hi", outcome: "answered", failure_reason: null, detail: null, response: "Hi there", source: "voice", created_at: 999 },
      { id: "3", transcript: "fail", outcome: "failed", failure_reason: "tool_failed", detail: "error", response: null, source: "voice", created_at: 998 },
    ]);

    const rows = await getRecentActivity({ limit: 10 });

    expect(rows).toHaveLength(3);
    expect(rows[0].outcome).toBe("pending");
    expect(rows[1].outcome).toBe("answered");
    expect(rows[2].outcome).toBe("failed");
    expect(rows[2].failureReason).toBe("tool_failed");
  });
});
