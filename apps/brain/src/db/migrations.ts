import type { Client } from "@libsql/client";

const MIGRATIONS: [string, string][] = [
  ["system-prompts.sql", `-- Create system_prompts table
CREATE TABLE IF NOT EXISTS system_prompts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    prompt TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')) NOT NULL,
    updated_at TEXT DEFAULT (datetime('now')) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_system_prompts_name ON system_prompts(name);
CREATE TRIGGER IF NOT EXISTS update_system_prompts_timestamp
AFTER UPDATE ON system_prompts
FOR EACH ROW
WHEN OLD.updated_at = NEW.updated_at
BEGIN
    UPDATE system_prompts
    SET updated_at = datetime('now')
    WHERE id = NEW.id;
END;`],
  ["chat-history.sql", `CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    attached_files TEXT,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_conversations_updated_at ON conversations(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_timestamp ON messages(conversation_id, timestamp ASC);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_role ON messages(conversation_id, role, timestamp ASC);
CREATE TRIGGER IF NOT EXISTS update_conversation_timestamp_on_message_insert
AFTER INSERT ON messages
FOR EACH ROW
BEGIN
    UPDATE conversations SET updated_at = NEW.timestamp WHERE id = NEW.conversation_id;
END;
CREATE TRIGGER IF NOT EXISTS update_conversation_timestamp_on_message_update
AFTER UPDATE ON messages
FOR EACH ROW
BEGIN
    UPDATE conversations SET updated_at = NEW.timestamp WHERE id = NEW.conversation_id;
END;`],
  ["learned-actions-v2.sql", `CREATE TABLE IF NOT EXISTS learned_actions (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  target TEXT NOT NULL,
  input TEXT NOT NULL,
  resolved_via TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 0.0,
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_learned_input ON learned_actions(input);`],
  ["skills.sql", `CREATE TABLE IF NOT EXISTS skills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  trigger_examples TEXT NOT NULL DEFAULT '[]',
  params TEXT NOT NULL DEFAULT '[]',
  plan_template TEXT NOT NULL,
  confirmed_by_user INTEGER NOT NULL DEFAULT 0,
  use_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_skills_name ON skills(name);`],
  ["memories.sql", `CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY,
  key TEXT,
  value TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'explicit',
  confirmed INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  last_used_at INTEGER
);`],
  ["audit-log.sql", `CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  action_type TEXT NOT NULL,
  summary TEXT NOT NULL,
  result TEXT NOT NULL,
  reversible INTEGER NOT NULL DEFAULT 0,
  undo_payload TEXT,
  created_at INTEGER NOT NULL
);`],
  ["reminders.sql", `CREATE TABLE IF NOT EXISTS reminders (
  id TEXT PRIMARY KEY,
  text TEXT NOT NULL,
  due_at INTEGER NOT NULL,
  recurrence TEXT,
  skill_id INTEGER,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);`],
  ["devices.sql", `CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  device_name TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT 'unknown',
  last_seen INTEGER NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  brain_url TEXT,
  app_version TEXT
);
CREATE INDEX IF NOT EXISTS idx_devices_last_seen ON devices(last_seen);`],
  ["voiceprints.sql", `CREATE TABLE IF NOT EXISTS voiceprints (
  id TEXT PRIMARY KEY,
  embedding TEXT NOT NULL,
  sample_count INTEGER NOT NULL DEFAULT 0,
  dims INTEGER NOT NULL,
  created_at TEXT DEFAULT (datetime('now')) NOT NULL,
  updated_at TEXT DEFAULT (datetime('now')) NOT NULL
);`],
  ["rag.sql", `CREATE TABLE IF NOT EXISTS memory_embeddings (
  id TEXT PRIMARY KEY,
  memory_id TEXT,
  content TEXT NOT NULL,
  embedding TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'memory',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_memory_embeddings_memory_id ON memory_embeddings(memory_id);
CREATE INDEX IF NOT EXISTS idx_memory_embeddings_source ON memory_embeddings(source);`],
];

export async function runMigrations(client: Client): Promise<void> {
  for (const [name, sql] of MIGRATIONS) {
    try {
      await client.executeMultiple(sql);
    } catch (err) {
      console.error(`[db] Migration "${name}" failed:`, (err as Error)?.message ?? err);
      throw err;
    }
  }
  console.log(`[db] ${MIGRATIONS.length} migrations applied`);
}
