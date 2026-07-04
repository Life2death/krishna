import { getDatabase } from "./driver";
import { redactText } from "../redact";

// T4-F7: every spoken utterance, success or failure, so the owner can see exactly what
// Krishna said and why — not just the command outcomes that command_log already tracks.
export type SpeechSource =
  | "answer" | "status" | "confirm_prompt" | "timeout" | "decline"
  | "filler" | "canned" | "error" | "ack" | "reask";

export interface SpeechLogEntry {
  id: string;
  text: string;
  source: SpeechSource;
  relatedCommandId?: string | null;
  createdAt: number;
}

interface DbSpeechLog {
  id: string;
  text: string;
  source: string;
  related_command_id: string | null;
  created_at: number;
}

const redact = (s: string) => redactText(s).text;

export async function logSpeech(e: {
  id: string;
  text: string;
  source: SpeechSource;
  relatedCommandId?: string | null;
  createdAt: number;
}): Promise<void> {
  const db = await getDatabase();
  await db.execute(
    `INSERT INTO speech_log (id, text, source, related_command_id, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [e.id, redact(e.text), e.source, e.relatedCommandId ?? null, e.createdAt]
  );
}

export async function getRecentSpeech(opts?: { limit?: number }): Promise<SpeechLogEntry[]> {
  const db = await getDatabase();
  const rows = await db.select<DbSpeechLog[]>(
    "SELECT * FROM speech_log ORDER BY created_at DESC LIMIT ?",
    [opts?.limit ?? 50]
  );
  return rows.map((r) => ({
    id: r.id,
    text: r.text,
    source: r.source as SpeechSource,
    relatedCommandId: r.related_command_id,
    createdAt: r.created_at,
  }));
}

export async function deleteAllSpeechLog(): Promise<void> {
  const db = await getDatabase();
  await db.execute("DELETE FROM speech_log");
}
