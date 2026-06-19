import { getDatabase } from "./driver";
import type { Memory } from "../types";

interface DbMemory {
  id: string;
  key: string | null;
  value: string;
  source: string;
  confirmed: number;
  created_at: number;
  last_used_at: number | null;
}

function toMemory(row: DbMemory): Memory {
  return {
    id: row.id,
    key: row.key,
    value: row.value,
    source: row.source,
    confirmed: row.confirmed,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
  };
}

export async function getAllMemories(): Promise<Memory[]> {
  const db = await getDatabase();
  const rows = await db.select<DbMemory[]>(
    "SELECT * FROM memories ORDER BY created_at DESC"
  );
  return rows.map(toMemory);
}

export async function getMemoryById(id: string): Promise<Memory | null> {
  const db = await getDatabase();
  const rows = await db.select<DbMemory[]>(
    "SELECT * FROM memories WHERE id = ?",
    [id]
  );
  return rows.length > 0 ? toMemory(rows[0]) : null;
}

export async function getMemoryByKey(key: string): Promise<Memory | null> {
  const db = await getDatabase();
  const rows = await db.select<DbMemory[]>(
    "SELECT * FROM memories WHERE LOWER(key) = LOWER(?)",
    [key]
  );
  return rows.length > 0 ? toMemory(rows[0]) : null;
}

export async function createMemory(memory: Memory): Promise<Memory> {
  const db = await getDatabase();
  if (memory.key) {
    await db.execute(
      "DELETE FROM memories WHERE LOWER(key) = LOWER(?)",
      [memory.key]
    );
  }
  await db.execute(
    "INSERT INTO memories (id, key, value, source, confirmed, created_at, last_used_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [memory.id, memory.key, memory.value, memory.source, memory.confirmed, memory.createdAt, memory.lastUsedAt]
  );
  return memory;
}

export async function deleteMemory(id: string): Promise<boolean> {
  const db = await getDatabase();
  const result = await db.execute("DELETE FROM memories WHERE id = ?", [id]);
  return result.rowsAffected > 0;
}

export async function deleteAllMemories(): Promise<boolean> {
  const db = await getDatabase();
  await db.execute("DELETE FROM memories");
  return true;
}