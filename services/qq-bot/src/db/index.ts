import fs from 'node:fs'
import path from 'node:path'

import { createClient } from '@libsql/client'

let client: ReturnType<typeof createClient>

export async function initDb(dbPath: string = 'data/qq-bot.db'): Promise<ReturnType<typeof createClient>> {
  const directory = path.dirname(dbPath)
  if (directory && directory !== '.')
    fs.mkdirSync(directory, { recursive: true })

  client = createClient({ url: `file:${dbPath}` })

  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS message_history (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id    TEXT    NOT NULL,
      sender_id     TEXT    NOT NULL,
      sender_name   TEXT,
      content       TEXT    NOT NULL,
      raw_text      TEXT,
      created_at    INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );
    CREATE INDEX IF NOT EXISTS idx_mh_session ON message_history(session_id, created_at);

    CREATE TABLE IF NOT EXISTS conversations (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id TEXT    NOT NULL UNIQUE,
      session_id      TEXT    NOT NULL,
      title           TEXT,
      persona_id      TEXT,
      content         TEXT,
      token_usage     INTEGER DEFAULT 0,
      created_at      INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      updated_at      INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );
    CREATE INDEX IF NOT EXISTS idx_conv_session ON conversations(session_id, updated_at);

    CREATE TABLE IF NOT EXISTS active_conversations (
      session_id      TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(conversation_id)
    );

    CREATE TABLE IF NOT EXISTS message_embeddings_cache (
      message_id   INTEGER PRIMARY KEY,
      embedding    TEXT NOT NULL,
      created_at   INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      updated_at   INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );
  `)

  try {
    // sqlite-vec 向量表（优先使用）。
    await client.execute(`
      CREATE VIRTUAL TABLE IF NOT EXISTS message_embeddings USING vec0(
        message_id INTEGER,
        embedding  float[1024]
      )
    `)
  }
  catch {
    // libsql 环境可能不支持 vec0，SemanticRetriever 会自动回退到 cache 表暴力 KNN。
  }

  return client
}

export function getDb(): ReturnType<typeof createClient> {
  return client
}
