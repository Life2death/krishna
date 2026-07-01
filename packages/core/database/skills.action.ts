import { getDatabase } from "./driver";
import type { Skill } from "../types";
import { writeTombstone, writeTombstones } from "../sync/tombstone";

interface DbSkill {
  id: number;
  name: string;
  trigger_examples: string;
  params: string;
  plan_template: string;
  confirmed_by_user: number;
  use_count: number;
  created_at: number;
}

function toSkill(row: DbSkill): Skill {
  return {
    id: row.id,
    name: row.name,
    triggerExamples: row.trigger_examples,
    params: row.params,
    planTemplate: row.plan_template,
    confirmedByUser: row.confirmed_by_user,
    useCount: row.use_count,
    createdAt: row.created_at,
  };
}

export async function getAllSkills(): Promise<Skill[]> {
  const db = await getDatabase();
  const rows = await db.select<DbSkill[]>(
    "SELECT * FROM skills ORDER BY created_at DESC"
  );
  return rows.map(toSkill);
}

export async function getSkillByName(name: string): Promise<Skill | null> {
  const db = await getDatabase();
  const rows = await db.select<DbSkill[]>(
    "SELECT * FROM skills WHERE name = ?",
    [name]
  );
  return rows.length > 0 ? toSkill(rows[0]) : null;
}

export async function getSkillById(id: number): Promise<Skill | null> {
  const db = await getDatabase();
  const rows = await db.select<DbSkill[]>(
    "SELECT * FROM skills WHERE id = ?",
    [id]
  );
  return rows.length > 0 ? toSkill(rows[0]) : null;
}

export async function createSkill(skill: Skill): Promise<Skill> {
  const db = await getDatabase();
  const now = Date.now();
  await db.execute(
    "INSERT INTO skills (id, name, trigger_examples, params, plan_template, confirmed_by_user, use_count, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [skill.id, skill.name, skill.triggerExamples, skill.params, skill.planTemplate, skill.confirmedByUser, skill.useCount, skill.createdAt, now]
  );
  return skill;
}

export async function updateSkillUseCount(id: number): Promise<void> {
  const db = await getDatabase();
  await db.execute(
    "UPDATE skills SET use_count = use_count + 1 WHERE id = ?",
    [id]
  );
}

export async function deleteSkill(id: number): Promise<boolean> {
  const db = await getDatabase();
  await writeTombstone('skills', String(id));
  const result = await db.execute("DELETE FROM skills WHERE id = ?", [id]);
  return result.rowsAffected > 0;
}

export async function deleteAllSkills(): Promise<boolean> {
  const db = await getDatabase();
  const rows = await db.select<{ id: number }[]>("SELECT id FROM skills");
  const ids = rows.map((r) => String(r.id));
  if (ids.length > 0) {
    await writeTombstones('skills', ids);
  }
  await db.execute("DELETE FROM skills");
  return true;
}