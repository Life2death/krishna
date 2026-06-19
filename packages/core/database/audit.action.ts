import { getDatabase } from "./driver";
import type { AuditEntry } from "../types/audit";

interface DbAudit {
  id: string;
  action_type: string;
  summary: string;
  result: string;
  reversible: number;
  undo_payload: string | null;
  created_at: number;
}

function toAudit(row: DbAudit): AuditEntry {
  return {
    id: row.id,
    actionType: row.action_type,
    summary: row.summary,
    result: row.result,
    reversible: row.reversible,
    undoPayload: row.undo_payload,
    createdAt: row.created_at,
  };
}

export async function getAllAuditEntries(): Promise<AuditEntry[]> {
  const db = await getDatabase();
  const rows = await db.select<DbAudit[]>(
    "SELECT * FROM audit_log ORDER BY created_at DESC"
  );
  return rows.map(toAudit);
}

export async function createAuditEntry(entry: AuditEntry): Promise<AuditEntry> {
  const db = await getDatabase();
  await db.execute(
    "INSERT INTO audit_log (id, action_type, summary, result, reversible, undo_payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [entry.id, entry.actionType, entry.summary, entry.result, entry.reversible, entry.undoPayload, entry.createdAt]
  );
  return entry;
}

export async function deleteAllAuditEntries(): Promise<boolean> {
  const db = await getDatabase();
  await db.execute("DELETE FROM audit_log");
  return true;
}

export async function getLastReversible(): Promise<AuditEntry | null> {
  const db = await getDatabase();
  const rows = await db.select<DbAudit[]>(
    "SELECT * FROM audit_log WHERE reversible = 1 ORDER BY created_at DESC LIMIT 1"
  );
  return rows.length > 0 ? toAudit(rows[0]) : null;
}
