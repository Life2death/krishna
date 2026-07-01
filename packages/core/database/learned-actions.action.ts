import { getDatabase } from "./driver";
import { LearnedAction } from "../types";
import { writeTombstone, writeTombstones } from "../sync/tombstone";

interface DbLearnedAction {
  id: string;
  display_name: string;
  target: string;
  input: string;
  resolved_via: string;
  confidence: number;
  created_at: number;
}

function toLearnedAction(row: DbLearnedAction): LearnedAction {
  return {
    id: row.id,
    displayName: row.display_name,
    target: row.target,
    input: row.input,
    resolvedVia: row.resolved_via,
    confidence: row.confidence,
    createdAt: row.created_at,
  };
}

export async function getAllLearnedActions(): Promise<LearnedAction[]> {
  const db = await getDatabase();
  const rows = await db.select<DbLearnedAction[]>(
    "SELECT * FROM learned_actions ORDER BY created_at DESC"
  );
  return rows.map(toLearnedAction);
}

export async function getLearnedActionByInput(input: string): Promise<LearnedAction | null> {
  const db = await getDatabase();
  const rows = await db.select<DbLearnedAction[]>(
    "SELECT * FROM learned_actions WHERE input = ?",
    [input.toLowerCase().trim()]
  );
  return rows.length > 0 ? toLearnedAction(rows[0]) : null;
}

export async function getLearnedActionById(id: string): Promise<LearnedAction | null> {
  const db = await getDatabase();
  const rows = await db.select<DbLearnedAction[]>(
    "SELECT * FROM learned_actions WHERE id = ?",
    [id]
  );
  return rows.length > 0 ? toLearnedAction(rows[0]) : null;
}

export async function createLearnedAction(action: LearnedAction): Promise<LearnedAction> {
  const db = await getDatabase();
  const now = Date.now();
  await db.execute(
    "INSERT INTO learned_actions (id, display_name, target, input, resolved_via, confidence, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [action.id, action.displayName, action.target, action.input, action.resolvedVia, action.confidence, action.createdAt, now]
  );
  return action;
}

export async function deleteLearnedAction(id: string): Promise<boolean> {
  const db = await getDatabase();
  await writeTombstone('learned_actions', id);
  const result = await db.execute("DELETE FROM learned_actions WHERE id = ?", [id]);
  return result.rowsAffected > 0;
}

export async function deleteAllLearnedActions(): Promise<boolean> {
  const db = await getDatabase();
  const rows = await db.select<{ id: string }[]>("SELECT id FROM learned_actions");
  const ids = rows.map((r) => r.id);
  if (ids.length > 0) {
    await writeTombstones('learned_actions', ids);
  }
  await db.execute("DELETE FROM learned_actions");
  return true;
}
