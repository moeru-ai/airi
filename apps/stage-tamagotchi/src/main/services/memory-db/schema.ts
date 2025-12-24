/**
 * SQLite database schema for memory storage
 */

export interface MemoryEntry {
  id: number
  type: 'short-term' | 'long-term'
  content: string
  timestamp: number
  metadata?: string // JSON string for additional data
  embedding?: string // JSON string for vector embeddings (for long-term memory)
}

export const CREATE_TABLES_SQL = `
  CREATE TABLE IF NOT EXISTS memories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL CHECK(type IN ('short-term', 'long-term')),
    content TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    metadata TEXT,
    embedding TEXT,
    created_at INTEGER DEFAULT (strftime('%s', 'now'))
  );

  CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type);
  CREATE INDEX IF NOT EXISTS idx_memories_timestamp ON memories(timestamp);
  CREATE INDEX IF NOT EXISTS idx_memories_created_at ON memories(created_at);
`
