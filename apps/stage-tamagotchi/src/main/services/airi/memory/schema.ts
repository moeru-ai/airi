/**
 * Fixed Phase 1 SQLite table names for desktop local-first memory.
 */
export const MEMORY_V1_TABLE_NAMES = [
  'profile_summary',
  'stable_facts',
  'recent_turns',
  'raw_turn_log',
  'memory_cards',
  'sync_state',
] as const

/**
 * Current Phase 1 schema version for desktop local-first memory.
 */
export const MEMORY_SCHEMA_V1_VERSION = 1

/**
 * Bootstrap SQL for the Phase 1 desktop local-first memory schema.
 *
 * Use when:
 * - Initializing the local SQLite database for desktop memory
 * - Verifying the shared schema skeleton before repository work begins
 *
 * Expects:
 * - SQLite-compatible execution in declaration order
 * - Future migrations to append V2+ changes instead of mutating this snapshot
 *
 * Returns:
 * - One SQL script containing the six Phase 1 `CREATE TABLE IF NOT EXISTS` statements
 */
export const memorySchemaV1Sql = `
CREATE TABLE IF NOT EXISTS profile_summary (
  id TEXT PRIMARY KEY,
  scope_user_id TEXT NOT NULL,
  scope_character_id TEXT NOT NULL,
  scope_session_id TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  summary_markdown TEXT NOT NULL,
  generated_from_turn_id TEXT,
  confidence REAL NOT NULL DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  superseded_by TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (superseded_by) REFERENCES profile_summary(id) DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE IF NOT EXISTS stable_facts (
  id TEXT PRIMARY KEY,
  scope_user_id TEXT NOT NULL,
  scope_character_id TEXT NOT NULL,
  scope_session_id TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  fact_key TEXT NOT NULL,
  fact_value TEXT NOT NULL,
  generated_from_turn_id TEXT,
  confidence REAL NOT NULL DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  superseded_by TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (superseded_by) REFERENCES stable_facts(id) DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE IF NOT EXISTS recent_turns (
  turn_id TEXT PRIMARY KEY,
  scope_user_id TEXT NOT NULL,
  scope_character_id TEXT NOT NULL,
  scope_session_id TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  role TEXT NOT NULL,
  turn_text TEXT NOT NULL,
  generated_from_turn_id TEXT,
  confidence REAL NOT NULL DEFAULT 1 CHECK (confidence >= 0 AND confidence <= 1),
  superseded_by TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (superseded_by) REFERENCES recent_turns(turn_id) DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE IF NOT EXISTS raw_turn_log (
  turn_id TEXT PRIMARY KEY,
  scope_user_id TEXT NOT NULL,
  scope_character_id TEXT NOT NULL,
  scope_session_id TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  role TEXT NOT NULL,
  raw_payload_json TEXT NOT NULL,
  generated_from_turn_id TEXT,
  confidence REAL NOT NULL DEFAULT 1 CHECK (confidence >= 0 AND confidence <= 1),
  superseded_by TEXT,
  sync_checkpoint INTEGER NOT NULL DEFAULT 0,
  sync_status TEXT NOT NULL DEFAULT 'pending',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (superseded_by) REFERENCES raw_turn_log(turn_id) DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE IF NOT EXISTS memory_cards (
  id TEXT PRIMARY KEY,
  scope_user_id TEXT NOT NULL,
  scope_character_id TEXT NOT NULL,
  scope_session_id TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  generated_from_turn_id TEXT,
  confidence REAL NOT NULL DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  superseded_by TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (superseded_by) REFERENCES memory_cards(id) DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE IF NOT EXISTS sync_state (
  id TEXT PRIMARY KEY,
  scope_user_id TEXT NOT NULL,
  scope_character_id TEXT NOT NULL,
  scope_session_id TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  generated_from_turn_id TEXT,
  confidence REAL NOT NULL DEFAULT 1 CHECK (confidence >= 0 AND confidence <= 1),
  superseded_by TEXT,
  sync_checkpoint INTEGER NOT NULL DEFAULT 0,
  last_local_turn_checkpoint INTEGER NOT NULL DEFAULT 0,
  remote_checkpoint TEXT,
  last_synced_turn_id TEXT,
  last_synced_at INTEGER,
  last_uploaded_turn_id TEXT,
  last_upload_at INTEGER,
  last_applied_summary_version INTEGER NOT NULL DEFAULT 0,
  last_applied_generated_from_turn_id TEXT,
  last_applied_turn_checkpoint INTEGER NOT NULL DEFAULT 0,
  last_pull_at INTEGER,
  next_pull_at INTEGER,
  pending_turn_count INTEGER NOT NULL DEFAULT 0,
  retry_count INTEGER NOT NULL DEFAULT 0,
  next_retry_at INTEGER,
  sync_state TEXT NOT NULL DEFAULT 'idle',
  last_error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (superseded_by) REFERENCES sync_state(id) DEFERRABLE INITIALLY DEFERRED
);

CREATE UNIQUE INDEX IF NOT EXISTS profile_summary_current_scope_unique
  ON profile_summary (scope_user_id, scope_character_id)
  WHERE superseded_by IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS stable_facts_current_scope_key_unique
  ON stable_facts (scope_user_id, scope_character_id, COALESCE(scope_session_id, ''), fact_key)
  WHERE superseded_by IS NULL;

CREATE INDEX IF NOT EXISTS recent_turns_scope_created_at_index
  ON recent_turns (scope_user_id, scope_character_id, COALESCE(scope_session_id, ''), created_at);

CREATE INDEX IF NOT EXISTS sync_state_scope_lookup_index
  ON sync_state (scope_user_id, scope_character_id, COALESCE(scope_session_id, ''), updated_at);

CREATE UNIQUE INDEX IF NOT EXISTS sync_state_current_scope_unique
  ON sync_state (scope_user_id, scope_character_id, COALESCE(scope_session_id, ''))
  WHERE superseded_by IS NULL;

CREATE INDEX IF NOT EXISTS raw_turn_log_pending_scope_created_at_index
  ON raw_turn_log (scope_user_id, scope_character_id, COALESCE(scope_session_id, ''), sync_status, created_at);
`.trim()
