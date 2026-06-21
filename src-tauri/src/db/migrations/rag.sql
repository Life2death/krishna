CREATE TABLE IF NOT EXISTS memory_embeddings (
  id TEXT PRIMARY KEY,
  memory_id TEXT,
  content TEXT NOT NULL,
  embedding TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'memory',
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_memory_embeddings_memory_id ON memory_embeddings(memory_id);
CREATE INDEX IF NOT EXISTS idx_memory_embeddings_source ON memory_embeddings(source);
