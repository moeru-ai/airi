// SQLite storage for the knowledge server (node:sqlite, built into Node.js 22.5+).
// FTS5 gives BM25 keyword search. `remove_diacritics 2` lets "kien truc" match "Kiến trúc".
// Vectors are Float32 BLOBs, scanned in memory (see search.mjs). Modeled on WeKnora Lite:
// internal/application/repository/retriever/sqlite/repository.go.

import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const SCHEMA_VERSION = 1
const FTS_TOKENIZER = 'unicode61 remove_diacritics 2'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS folders (
  id INTEGER PRIMARY KEY,
  path TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  include_code INTEGER NOT NULL DEFAULT 0,
  added_at TEXT NOT NULL,
  last_sync TEXT
);
CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY,
  folder_id INTEGER NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
  path TEXT NOT NULL UNIQUE,
  rel TEXT NOT NULL,
  kind TEXT NOT NULL,
  hash TEXT NOT NULL,
  title TEXT NOT NULL,
  units TEXT,
  summary TEXT,
  gist TEXT,
  topics TEXT,
  doc_type TEXT,
  wiki_hash TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  error TEXT,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS documents_folder ON documents(folder_id);
CREATE TABLE IF NOT EXISTS chunks (
  id INTEGER PRIMARY KEY,
  doc_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  chunk_type TEXT NOT NULL,
  header TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS chunks_doc ON chunks(doc_id);
CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(content, header, title, tokenize = '${FTS_TOKENIZER}');
CREATE TABLE IF NOT EXISTS embeddings (
  chunk_id INTEGER PRIMARY KEY REFERENCES chunks(id) ON DELETE CASCADE,
  model TEXT NOT NULL,
  dim INTEGER NOT NULL,
  vector BLOB NOT NULL
);
CREATE TABLE IF NOT EXISTS wiki_pages (
  folder_id INTEGER NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  page_type TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  aliases TEXT NOT NULL DEFAULT '[]',
  source_doc_ids TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL,
  PRIMARY KEY (folder_id, slug)
);
CREATE VIRTUAL TABLE IF NOT EXISTS wiki_fts USING fts5(folder_id UNINDEXED, slug, title, summary, content, tokenize = '${FTS_TOKENIZER}');
CREATE TABLE IF NOT EXISTS wiki_links (
  folder_id INTEGER NOT NULL,
  from_slug TEXT NOT NULL,
  to_slug TEXT NOT NULL,
  PRIMARY KEY (folder_id, from_slug, to_slug)
);
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  folder_id INTEGER,
  status TEXT NOT NULL,
  progress TEXT NOT NULL DEFAULT '{}',
  error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`

/** Opens (and creates) the knowledge database. */
export function openDatabase(path) {
  if (path !== ':memory:')
    mkdirSync(dirname(path), { recursive: true })
  const db = new DatabaseSync(path)
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;')
  db.exec(SCHEMA)
  db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`)
  return db
}

/** Runs `work` in one transaction and rolls back on error. */
export function transaction(db, work) {
  db.exec('BEGIN')
  try {
    const result = work()
    db.exec('COMMIT')
    return result
  }
  catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

/** Removes a document's chunks, their FTS rows, and their vectors. */
export function deleteDocumentChunks(db, docId) {
  db.prepare('DELETE FROM chunks_fts WHERE rowid IN (SELECT id FROM chunks WHERE doc_id = ?)').run(docId)
  db.prepare('DELETE FROM chunks WHERE doc_id = ?').run(docId)
}

/** Inserts chunks for one document. Returns their ids in input order. */
export function insertChunks(db, docId, title, chunks) {
  const insert = db.prepare('INSERT INTO chunks (doc_id, seq, chunk_type, header, content) VALUES (?, ?, ?, ?, ?)')
  const insertFts = db.prepare('INSERT INTO chunks_fts (rowid, content, header, title) VALUES (?, ?, ?, ?)')
  return chunks.map((chunk, seq) => {
    const { lastInsertRowid } = insert.run(docId, seq, chunk.type, chunk.header ?? '', chunk.content)
    insertFts.run(lastInsertRowid, chunk.content, chunk.header ?? '', title)
    return Number(lastInsertRowid)
  })
}

export function saveEmbedding(db, chunkId, model, vector) {
  db.prepare('INSERT OR REPLACE INTO embeddings (chunk_id, model, dim, vector) VALUES (?, ?, ?, ?)')
    .run(chunkId, model, vector.length, new Uint8Array(vector.buffer, vector.byteOffset, vector.byteLength))
}

/** Reads a stored BLOB back into a Float32Array. */
export function toVector(blob) {
  return new Float32Array(blob.buffer.slice(blob.byteOffset, blob.byteOffset + blob.byteLength))
}
