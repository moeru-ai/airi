import type { StatementSync } from 'node:sqlite'

import type {
  ApplyMemoryPatchResult,
  MemoryPatchPayload,
  MemoryStableFactPatch,
} from './sync-types'
import type {
  MemoryAppendTurnInput,
  MemoryGetSyncStateInput,
  MemoryProfileSummaryRecord,
  MemoryPromptContext,
  MemoryRawTurnRecord,
  MemoryReadPromptContextInput,
  MemoryRecentTurnRecord,
  MemoryReplaceProfileSummaryInput,
  MemoryRepositoryScope,
  MemoryStableFactRecord,
  MemorySyncStateRecord,
  MemoryUpsertStableFactInput,
} from './types'

import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import { memorySchemaV1Sql } from './schema'

interface MemoryRepositoryOptions {
  /** Absolute or relative SQLite database path. Use `:memory:` for in-memory tests. */
  databasePath: string
}

/**
 * Input for deleting uploaded local raw/recent turns after cloud confirmation.
 */
export interface MemoryPruneUploadedTurnsInput {
  /** Scope whose short-term turn rows should be considered for pruning. */
  scope: MemoryRepositoryScope
  /** Current Unix timestamp in milliseconds used to compute the retention cutoff. */
  now: number
  /** Configurable retention window in milliseconds. Rows newer than this window are kept. */
  retentionWindowMs: number
}

/**
 * Result of one uploaded-turn pruning pass.
 */
export interface MemoryPruneUploadedTurnsResult {
  /** Number of rows deleted from `raw_turn_log`. */
  prunedRawTurnCount: number
  /** Number of rows deleted from `recent_turns`. */
  prunedRecentTurnCount: number
}

/**
 * Synchronous local-first SQLite repository for desktop memory.
 */
export interface MemoryRepository {
  initialize: () => void
  appendTurn: (input: MemoryAppendTurnInput) => MemoryRecentTurnRecord
  replaceProfileSummary: (input: MemoryReplaceProfileSummaryInput) => MemoryProfileSummaryRecord
  upsertStableFact: (input: MemoryUpsertStableFactInput) => MemoryStableFactRecord
  readPromptContext: (input: MemoryReadPromptContextInput) => MemoryPromptContext
  getSyncState: (input: MemoryGetSyncStateInput) => MemorySyncStateRecord | null
  listPendingRawTurnScopes: () => MemoryRepositoryScope[]
  listPendingRawTurns: (input: MemoryGetSyncStateInput) => MemoryRawTurnRecord[]
  listSyncScopes: () => MemoryRepositoryScope[]
  markRawTurnsUploaded: (input: { scope: MemoryRepositoryScope, turnIds: string[], uploadedAt: number }) => void
  pruneUploadedTurns: (input: MemoryPruneUploadedTurnsInput) => MemoryPruneUploadedTurnsResult
  recordRawTurnUploadFailure: (input: { scope: MemoryRepositoryScope, error: string, failedAt: number, nextRetryAt: number }) => void
  applyMemoryPatch: (input: { patch: MemoryPatchPayload, pulledAt: number, nextPullAt: number }) => ApplyMemoryPatchResult
  recordMemoryPatchPullFailure: (input: { scope: MemoryRepositoryScope, error: string, failedAt: number, nextPullAt: number }) => void
  close: () => void
}

interface ScopeBoundValues {
  sessionId: string | null
  userId: string
  characterId: string
}

interface ProfileSummaryRow {
  id: string
  scope_user_id: string
  scope_character_id: string
  scope_session_id: string | null
  version: number
  summary_markdown: string
  generated_from_turn_id: string | null
  confidence: number
  superseded_by: string | null
  created_at: number
  updated_at: number
}

interface StableFactRow {
  id: string
  scope_user_id: string
  scope_character_id: string
  scope_session_id: string | null
  version: number
  fact_key: string
  fact_value: string
  generated_from_turn_id: string | null
  confidence: number
  superseded_by: string | null
  created_at: number
  updated_at: number
}

interface RecentTurnRow {
  turn_id: string
  scope_user_id: string
  scope_character_id: string
  scope_session_id: string | null
  version: number
  role: MemoryRecentTurnRecord['role']
  turn_text: string
  created_at: number
  updated_at: number
}

interface RawTurnRow {
  turn_id: string
  scope_user_id: string
  scope_character_id: string
  scope_session_id: string | null
  version: number
  role: MemoryRecentTurnRecord['role']
  raw_payload_json: string
  sync_status: 'pending' | 'uploaded'
  turn_text: string
  created_at: number
  updated_at: number
}

interface SyncStateRow {
  id: string
  scope_user_id: string
  scope_character_id: string
  scope_session_id: string | null
  version: number
  generated_from_turn_id: string | null
  confidence: number
  superseded_by: string | null
  sync_checkpoint: number
  last_local_turn_checkpoint: number
  remote_checkpoint: string | null
  last_synced_turn_id: string | null
  last_synced_at: number | null
  last_uploaded_turn_id: string | null
  last_upload_at: number | null
  last_applied_summary_version: number
  last_applied_generated_from_turn_id: string | null
  last_applied_turn_checkpoint: number
  last_pull_at: number | null
  next_pull_at: number | null
  pending_turn_count: number
  retry_count: number
  next_retry_at: number | null
  sync_state: string
  last_error: string | null
  created_at: number
  updated_at: number
}

interface MemoryRepositoryStatements {
  insertProfileSummaryStatement: StatementSync
  insertRawTurnStatement: StatementSync
  insertRecentTurnStatement: StatementSync
  insertStableFactStatement: StatementSync
  insertSyncStateStatement: StatementSync
  selectCurrentProfileSummaryStatement: StatementSync
  selectCurrentStableFactStatement: StatementSync
  selectCurrentSyncStateStatement: StatementSync
  selectLastRawTurnCheckpointStatement: StatementSync
  selectPendingRawTurnCountStatement: StatementSync
  selectPendingRawTurnScopesStatement: StatementSync
  selectPendingRawTurnsStatement: StatementSync
  selectRecentTurnsForPromptContextStatement: StatementSync
  selectStableFactsForPromptContextStatement: StatementSync
  selectSyncScopesStatement: StatementSync
  selectTurnCheckpointByTurnIdStatement: StatementSync
  supersedeProfileSummaryStatement: StatementSync
  supersedeStableFactStatement: StatementSync
  updateSyncStateStatement: StatementSync
  upsertMemoryCardStatement: StatementSync
}

function isInMemoryDatabasePath(databasePath: string) {
  return databasePath === ':memory:'
    || databasePath.startsWith('file::memory:')
}

function ensureDatabaseDirectory(databasePath: string) {
  if (isInMemoryDatabasePath(databasePath)) {
    return
  }

  // SQLite will create the file itself, but the parent directory must exist first.
  mkdirSync(dirname(databasePath), { recursive: true })
}

function toScopeBoundValues(scope: MemoryRepositoryScope): ScopeBoundValues {
  return {
    characterId: scope.characterId,
    sessionId: scope.sessionId ?? null,
    userId: scope.userId,
  }
}

function mapScope(row: { scope_user_id: string, scope_character_id: string, scope_session_id: string | null }): MemoryRepositoryScope {
  return {
    characterId: row.scope_character_id,
    sessionId: row.scope_session_id,
    userId: row.scope_user_id,
  }
}

function mapProfileSummaryRow(row: ProfileSummaryRow): MemoryProfileSummaryRecord {
  return {
    confidence: row.confidence,
    createdAt: row.created_at,
    generatedFromTurnId: row.generated_from_turn_id,
    id: row.id,
    scope: mapScope(row),
    summaryMarkdown: row.summary_markdown,
    supersededBy: row.superseded_by,
    updatedAt: row.updated_at,
    version: row.version,
  }
}

function mapStableFactRow(row: StableFactRow): MemoryStableFactRecord {
  return {
    confidence: row.confidence,
    createdAt: row.created_at,
    factKey: row.fact_key,
    factValue: row.fact_value,
    generatedFromTurnId: row.generated_from_turn_id,
    id: row.id,
    scope: mapScope(row),
    supersededBy: row.superseded_by,
    updatedAt: row.updated_at,
    version: row.version,
  }
}

function mapRecentTurnRow(row: RecentTurnRow): MemoryRecentTurnRecord {
  return {
    createdAt: row.created_at,
    role: row.role,
    scope: mapScope(row),
    text: row.turn_text,
    turnId: row.turn_id,
    updatedAt: row.updated_at,
    version: row.version,
  }
}

function mapRawTurnRow(row: RawTurnRow): MemoryRawTurnRecord {
  return {
    createdAt: row.created_at,
    rawPayload: JSON.parse(row.raw_payload_json) as Record<string, unknown> | null,
    role: row.role,
    scope: mapScope(row),
    syncStatus: row.sync_status,
    text: row.turn_text,
    turnId: row.turn_id,
    updatedAt: row.updated_at,
    version: row.version,
  }
}

function mapSyncStateRow(row: SyncStateRow): MemorySyncStateRecord {
  return {
    confidence: row.confidence,
    createdAt: row.created_at,
    generatedFromTurnId: row.generated_from_turn_id,
    id: row.id,
    lastAppliedGeneratedFromTurnId: row.last_applied_generated_from_turn_id,
    lastAppliedSummaryVersion: row.last_applied_summary_version,
    lastAppliedTurnCheckpoint: row.last_applied_turn_checkpoint,
    lastError: row.last_error,
    lastLocalTurnCheckpoint: row.last_local_turn_checkpoint,
    lastPullAt: row.last_pull_at,
    lastSyncedAt: row.last_synced_at,
    lastSyncedTurnId: row.last_synced_turn_id,
    lastUploadAt: row.last_upload_at,
    lastUploadedTurnId: row.last_uploaded_turn_id,
    nextPullAt: row.next_pull_at,
    nextRetryAt: row.next_retry_at,
    pendingTurnCount: row.pending_turn_count,
    remoteCheckpoint: row.remote_checkpoint,
    retryCount: row.retry_count,
    scope: mapScope(row),
    state: row.sync_state,
    supersededBy: row.superseded_by,
    syncCheckpoint: row.sync_checkpoint,
    updatedAt: row.updated_at,
    version: row.version,
  }
}

function runInTransaction<T>(database: DatabaseSync, work: () => T): T {
  database.exec('BEGIN IMMEDIATE')

  try {
    const result = work()
    database.exec('COMMIT')
    return result
  }
  catch (error) {
    if (database.isTransaction) {
      database.exec('ROLLBACK')
    }

    throw error
  }
}

/**
 * Creates the local SQLite repository for desktop memory, sync upload, and patch merge workflows.
 *
 * Use when:
 * - Desktop main-process services need one concrete local-first memory implementation
 * - Tests need real SQLite-backed reads, writes, sync bookkeeping, and patch merge behavior
 *
 * Expects:
 * - `databasePath` points to a writable file location or `:memory:`
 * - Callers invoke `initialize()` before repository reads or writes
 *
 * Returns:
 * - A synchronous repository covering prompt reads, turn writes, sync status, and patch application
 */
export function createMemoryRepository(options: MemoryRepositoryOptions): MemoryRepository {
  ensureDatabaseDirectory(options.databasePath)

  const database = new DatabaseSync(options.databasePath)
  let statements: MemoryRepositoryStatements | null = null

  function prepareStatements(): MemoryRepositoryStatements {
    return {
      insertProfileSummaryStatement: database.prepare(`
        INSERT INTO profile_summary (
          id,
          scope_user_id,
          scope_character_id,
          scope_session_id,
          version,
          summary_markdown,
          generated_from_turn_id,
          confidence,
          superseded_by,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `),
      insertRawTurnStatement: database.prepare(`
        INSERT INTO raw_turn_log (
          turn_id,
          scope_user_id,
          scope_character_id,
          scope_session_id,
          version,
          role,
          raw_payload_json,
          generated_from_turn_id,
          confidence,
          superseded_by,
          sync_checkpoint,
          sync_status,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `),
      insertRecentTurnStatement: database.prepare(`
        INSERT INTO recent_turns (
          turn_id,
          scope_user_id,
          scope_character_id,
          scope_session_id,
          version,
          role,
          turn_text,
          generated_from_turn_id,
          confidence,
          superseded_by,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `),
      insertStableFactStatement: database.prepare(`
        INSERT INTO stable_facts (
          id,
          scope_user_id,
          scope_character_id,
          scope_session_id,
          version,
          fact_key,
          fact_value,
          generated_from_turn_id,
          confidence,
          superseded_by,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `),
      insertSyncStateStatement: database.prepare(`
        INSERT INTO sync_state (
          id,
          scope_user_id,
          scope_character_id,
          scope_session_id,
          version,
          generated_from_turn_id,
          confidence,
          superseded_by,
          sync_checkpoint,
          last_local_turn_checkpoint,
          remote_checkpoint,
          last_synced_turn_id,
          last_synced_at,
          last_uploaded_turn_id,
          last_upload_at,
          last_applied_summary_version,
          last_applied_generated_from_turn_id,
          last_applied_turn_checkpoint,
          last_pull_at,
          next_pull_at,
          pending_turn_count,
          retry_count,
          next_retry_at,
          sync_state,
          last_error,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `),
      selectCurrentProfileSummaryStatement: database.prepare(`
        SELECT
          id,
          scope_user_id,
          scope_character_id,
          scope_session_id,
          version,
          summary_markdown,
          generated_from_turn_id,
          confidence,
          superseded_by,
          created_at,
          updated_at
        FROM profile_summary
        WHERE scope_user_id = ?
          AND scope_character_id = ?
          AND superseded_by IS NULL
        ORDER BY updated_at DESC, created_at DESC
        LIMIT 1
      `),
      selectCurrentStableFactStatement: database.prepare(`
        SELECT
          id,
          scope_user_id,
          scope_character_id,
          scope_session_id,
          version,
          fact_key,
          fact_value,
          generated_from_turn_id,
          confidence,
          superseded_by,
          created_at,
          updated_at
        FROM stable_facts
        WHERE scope_user_id = ?
          AND scope_character_id = ?
          AND ((? IS NULL AND scope_session_id IS NULL) OR scope_session_id = ?)
          AND fact_key = ?
          AND superseded_by IS NULL
        ORDER BY updated_at DESC, created_at DESC
        LIMIT 1
      `),
      selectCurrentSyncStateStatement: database.prepare(`
        SELECT
          id,
          scope_user_id,
          scope_character_id,
          scope_session_id,
          version,
          generated_from_turn_id,
          confidence,
          superseded_by,
          sync_checkpoint,
          last_local_turn_checkpoint,
          remote_checkpoint,
          last_synced_turn_id,
          last_synced_at,
          last_uploaded_turn_id,
          last_upload_at,
          last_applied_summary_version,
          last_applied_generated_from_turn_id,
          last_applied_turn_checkpoint,
          last_pull_at,
          next_pull_at,
          pending_turn_count,
          retry_count,
          next_retry_at,
          sync_state,
          last_error,
          created_at,
          updated_at
        FROM sync_state
        WHERE scope_user_id = ?
          AND scope_character_id = ?
          AND ((? IS NULL AND scope_session_id IS NULL) OR scope_session_id = ?)
          AND superseded_by IS NULL
        ORDER BY updated_at DESC, created_at DESC
        LIMIT 1
      `),
      selectLastRawTurnCheckpointStatement: database.prepare(`
        SELECT COALESCE(MAX(created_at), 0) AS checkpoint
        FROM raw_turn_log
        WHERE scope_user_id = ?
          AND scope_character_id = ?
          AND ((? IS NULL AND scope_session_id IS NULL) OR scope_session_id = ?)
      `),
      selectPendingRawTurnCountStatement: database.prepare(`
        SELECT COUNT(*) AS count
        FROM raw_turn_log
        WHERE scope_user_id = ?
          AND scope_character_id = ?
          AND ((? IS NULL AND scope_session_id IS NULL) OR scope_session_id = ?)
          AND sync_status = 'pending'
      `),
      selectPendingRawTurnScopesStatement: database.prepare(`
        SELECT
          scope_user_id,
          scope_character_id,
          scope_session_id
        FROM raw_turn_log
        WHERE sync_status = 'pending'
        GROUP BY scope_user_id, scope_character_id, scope_session_id
        ORDER BY MIN(created_at) ASC
      `),
      selectPendingRawTurnsStatement: database.prepare(`
        SELECT
          raw_turn_log.turn_id,
          raw_turn_log.scope_user_id,
          raw_turn_log.scope_character_id,
          raw_turn_log.scope_session_id,
          raw_turn_log.version,
          raw_turn_log.role,
          raw_turn_log.raw_payload_json,
          raw_turn_log.sync_status,
          COALESCE(recent_turns.turn_text, '') AS turn_text,
          raw_turn_log.created_at,
          raw_turn_log.updated_at
        FROM raw_turn_log
        LEFT JOIN recent_turns
          ON recent_turns.turn_id = raw_turn_log.turn_id
        WHERE raw_turn_log.scope_user_id = ?
          AND raw_turn_log.scope_character_id = ?
          AND ((? IS NULL AND raw_turn_log.scope_session_id IS NULL) OR raw_turn_log.scope_session_id = ?)
          AND raw_turn_log.sync_status = 'pending'
        ORDER BY raw_turn_log.created_at ASC, raw_turn_log.turn_id ASC
      `),
      selectRecentTurnsForPromptContextStatement: database.prepare(`
        SELECT
          turn_id,
          scope_user_id,
          scope_character_id,
          scope_session_id,
          version,
          role,
          turn_text,
          created_at,
          updated_at
        FROM (
          SELECT
            turn_id,
            scope_user_id,
            scope_character_id,
            scope_session_id,
            version,
            role,
            turn_text,
            created_at,
            updated_at
          FROM recent_turns
          WHERE scope_user_id = ?
            AND scope_character_id = ?
            AND ((? IS NULL AND scope_session_id IS NULL) OR scope_session_id = ?)
            AND superseded_by IS NULL
          ORDER BY created_at DESC, turn_id DESC
          LIMIT 24
        )
        ORDER BY created_at ASC, turn_id ASC
      `),
      selectStableFactsForPromptContextStatement: database.prepare(`
        SELECT
          id,
          scope_user_id,
          scope_character_id,
          scope_session_id,
          version,
          fact_key,
          fact_value,
          generated_from_turn_id,
          confidence,
          superseded_by,
          created_at,
          updated_at
        FROM stable_facts
        WHERE scope_user_id = ?
          AND scope_character_id = ?
          AND ((? IS NULL AND scope_session_id IS NULL) OR scope_session_id = ?)
          AND superseded_by IS NULL
        ORDER BY fact_key ASC, created_at ASC
      `),
      selectSyncScopesStatement: database.prepare(`
        SELECT
          scope_user_id,
          scope_character_id,
          scope_session_id
        FROM sync_state
        WHERE superseded_by IS NULL
        ORDER BY updated_at ASC
      `),
      selectTurnCheckpointByTurnIdStatement: database.prepare(`
        SELECT created_at AS checkpoint
        FROM raw_turn_log
        WHERE turn_id = ?
          AND scope_user_id = ?
          AND scope_character_id = ?
          AND ((? IS NULL AND scope_session_id IS NULL) OR scope_session_id = ?)
        LIMIT 1
      `),
      supersedeProfileSummaryStatement: database.prepare(`
        UPDATE profile_summary
        SET superseded_by = ?, updated_at = ?
        WHERE id = ?
      `),
      supersedeStableFactStatement: database.prepare(`
        UPDATE stable_facts
        SET superseded_by = ?, updated_at = ?
        WHERE id = ?
      `),
      updateSyncStateStatement: database.prepare(`
        UPDATE sync_state
        SET version = ?,
            generated_from_turn_id = ?,
            sync_checkpoint = ?,
            last_local_turn_checkpoint = ?,
            last_synced_turn_id = ?,
            last_synced_at = ?,
            last_uploaded_turn_id = ?,
            last_upload_at = ?,
            last_applied_summary_version = ?,
            last_applied_generated_from_turn_id = ?,
            last_applied_turn_checkpoint = ?,
            last_pull_at = ?,
            next_pull_at = ?,
            pending_turn_count = ?,
            retry_count = ?,
            next_retry_at = ?,
            sync_state = ?,
            last_error = ?,
            updated_at = ?
        WHERE id = ?
      `),
      upsertMemoryCardStatement: database.prepare(`
        INSERT INTO memory_cards (
          id,
          scope_user_id,
          scope_character_id,
          scope_session_id,
          version,
          title,
          content,
          generated_from_turn_id,
          confidence,
          superseded_by,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          scope_user_id = excluded.scope_user_id,
          scope_character_id = excluded.scope_character_id,
          scope_session_id = excluded.scope_session_id,
          version = memory_cards.version + 1,
          title = excluded.title,
          content = excluded.content,
          generated_from_turn_id = excluded.generated_from_turn_id,
          confidence = excluded.confidence,
          updated_at = excluded.updated_at
      `),
    }
  }

  function getStatements(): MemoryRepositoryStatements {
    if (!statements) {
      throw new Error('Memory repository schema is not initialized. Call initialize() before using repository methods.')
    }

    return statements
  }

  function getPendingTurnCount(scope: ScopeBoundValues) {
    const preparedStatements = getStatements()
    const row = preparedStatements.selectPendingRawTurnCountStatement.get(
      scope.userId,
      scope.characterId,
      scope.sessionId,
      scope.sessionId,
    ) as { count: number } | undefined

    return row?.count ?? 0
  }

  function getLastRawTurnCheckpoint(scope: ScopeBoundValues) {
    const preparedStatements = getStatements()
    const row = preparedStatements.selectLastRawTurnCheckpointStatement.get(
      scope.userId,
      scope.characterId,
      scope.sessionId,
      scope.sessionId,
    ) as { checkpoint: number | null } | undefined

    return row?.checkpoint ?? 0
  }

  function selectCurrentSyncState(scope: ScopeBoundValues) {
    const preparedStatements = getStatements()
    return preparedStatements.selectCurrentSyncStateStatement.get(
      scope.userId,
      scope.characterId,
      scope.sessionId,
      scope.sessionId,
    ) as SyncStateRow | undefined
  }

  function resolveTurnCheckpoint(scope: ScopeBoundValues, turnId: string | null | undefined) {
    if (!turnId) {
      return null
    }

    const preparedStatements = getStatements()
    const row = preparedStatements.selectTurnCheckpointByTurnIdStatement.get(
      turnId,
      scope.userId,
      scope.characterId,
      scope.sessionId,
      scope.sessionId,
    ) as { checkpoint: number | null } | undefined

    return row?.checkpoint ?? null
  }

  function upsertSyncState(params: {
    scope: ScopeBoundValues
    updatedAt: number
    lastUploadedTurnId?: string | null
    lastUploadAt?: number | null
    lastSyncedTurnId?: string | null
    lastSyncedAt?: number | null
    lastAppliedSummaryVersion?: number
    lastAppliedGeneratedFromTurnId?: string | null
    lastAppliedTurnCheckpoint?: number
    lastPullAt?: number | null
    nextPullAt?: number | null
    pendingTurnCount: number
    retryCount: number
    nextRetryAt?: number | null
    state: string
    lastError?: string | null
    syncCheckpoint: number
    lastLocalTurnCheckpoint: number
    generatedFromTurnId?: string | null
  }) {
    const preparedStatements = getStatements()
    const currentRow = selectCurrentSyncState(params.scope)

    if (!currentRow) {
      preparedStatements.insertSyncStateStatement.run(
        randomUUID(),
        params.scope.userId,
        params.scope.characterId,
        params.scope.sessionId,
        1,
        params.generatedFromTurnId ?? null,
        1,
        null,
        params.syncCheckpoint,
        params.lastLocalTurnCheckpoint,
        null,
        params.lastSyncedTurnId ?? null,
        params.lastSyncedAt ?? null,
        params.lastUploadedTurnId ?? null,
        params.lastUploadAt ?? null,
        params.lastAppliedSummaryVersion ?? 0,
        params.lastAppliedGeneratedFromTurnId ?? null,
        params.lastAppliedTurnCheckpoint ?? 0,
        params.lastPullAt ?? null,
        params.nextPullAt ?? null,
        params.pendingTurnCount,
        params.retryCount,
        params.nextRetryAt ?? null,
        params.state,
        params.lastError ?? null,
        params.updatedAt,
        params.updatedAt,
      )
      return
    }

    preparedStatements.updateSyncStateStatement.run(
      currentRow.version + 1,
      params.generatedFromTurnId ?? currentRow.generated_from_turn_id,
      params.syncCheckpoint,
      params.lastLocalTurnCheckpoint,
      params.lastSyncedTurnId ?? currentRow.last_synced_turn_id,
      params.lastSyncedAt ?? currentRow.last_synced_at,
      params.lastUploadedTurnId ?? currentRow.last_uploaded_turn_id,
      params.lastUploadAt ?? currentRow.last_upload_at,
      params.lastAppliedSummaryVersion ?? currentRow.last_applied_summary_version,
      params.lastAppliedGeneratedFromTurnId ?? currentRow.last_applied_generated_from_turn_id,
      params.lastAppliedTurnCheckpoint ?? currentRow.last_applied_turn_checkpoint,
      params.lastPullAt ?? currentRow.last_pull_at,
      params.nextPullAt ?? currentRow.next_pull_at,
      params.pendingTurnCount,
      params.retryCount,
      params.nextRetryAt ?? currentRow.next_retry_at,
      params.state,
      params.lastError ?? currentRow.last_error,
      params.updatedAt,
      currentRow.id,
    )
  }

  function applyFactPatch(params: {
    scope: ScopeBoundValues
    factPatch: MemoryStableFactPatch
    updatedAt: number
  }) {
    const preparedStatements = getStatements()
    const currentRow = preparedStatements.selectCurrentStableFactStatement.get(
      params.scope.userId,
      params.scope.characterId,
      params.scope.sessionId,
      params.scope.sessionId,
      params.factPatch.factKey,
    ) as StableFactRow | undefined
    const nextId = randomUUID()
    const nextVersion = (currentRow?.version ?? 0) + 1

    if (currentRow) {
      preparedStatements.supersedeStableFactStatement.run(nextId, params.updatedAt, currentRow.id)
    }

    preparedStatements.insertStableFactStatement.run(
      nextId,
      params.scope.userId,
      params.scope.characterId,
      params.scope.sessionId,
      nextVersion,
      params.factPatch.factKey,
      params.factPatch.factValue,
      params.factPatch.generatedFromTurnId,
      params.factPatch.confidence ?? 1,
      null,
      params.updatedAt,
      params.updatedAt,
    )
  }

  return {
    appendTurn(input) {
      const preparedStatements = getStatements()
      const scope = toScopeBoundValues(input.scope)
      const rawPayloadJson = JSON.stringify(input.rawPayload ?? null)

      runInTransaction(database, () => {
        preparedStatements.insertRawTurnStatement.run(
          input.turnId,
          scope.userId,
          scope.characterId,
          scope.sessionId,
          1,
          input.role,
          rawPayloadJson,
          null,
          1,
          null,
          0,
          'pending',
          input.createdAt,
          input.createdAt,
        )
        preparedStatements.insertRecentTurnStatement.run(
          input.turnId,
          scope.userId,
          scope.characterId,
          scope.sessionId,
          1,
          input.role,
          input.text,
          null,
          1,
          null,
          input.createdAt,
          input.createdAt,
        )
      })

      return {
        createdAt: input.createdAt,
        role: input.role,
        scope: input.scope,
        text: input.text,
        turnId: input.turnId,
        updatedAt: input.createdAt,
        version: 1,
      }
    },

    close() {
      database.close()
    },

    getSyncState(input) {
      const scope = toScopeBoundValues(input.scope)
      const row = selectCurrentSyncState(scope)

      return row ? mapSyncStateRow(row) : null
    },

    initialize() {
      database.exec(memorySchemaV1Sql)
      statements ??= prepareStatements()
    },

    listPendingRawTurnScopes() {
      const preparedStatements = getStatements()
      const rows = preparedStatements.selectPendingRawTurnScopesStatement.all() as Array<{
        scope_user_id: string
        scope_character_id: string
        scope_session_id: string | null
      }>

      return rows.map(mapScope)
    },

    listPendingRawTurns(input) {
      const preparedStatements = getStatements()
      const scope = toScopeBoundValues(input.scope)
      const rows = preparedStatements.selectPendingRawTurnsStatement.all(
        scope.userId,
        scope.characterId,
        scope.sessionId,
        scope.sessionId,
      ) as unknown as RawTurnRow[]

      return rows.map(mapRawTurnRow)
    },

    listSyncScopes() {
      const preparedStatements = getStatements()
      const rows = preparedStatements.selectSyncScopesStatement.all() as Array<{
        scope_user_id: string
        scope_character_id: string
        scope_session_id: string | null
      }>

      return rows.map(mapScope)
    },

    markRawTurnsUploaded(input) {
      const scope = toScopeBoundValues(input.scope)
      if (input.turnIds.length === 0) {
        return
      }

      runInTransaction(database, () => {
        const placeholders = input.turnIds.map(() => '?').join(', ')
        database.prepare(`
          UPDATE raw_turn_log
          SET sync_status = 'uploaded',
              sync_checkpoint = ?,
              updated_at = ?
          WHERE scope_user_id = ?
            AND scope_character_id = ?
            AND ((? IS NULL AND scope_session_id IS NULL) OR scope_session_id = ?)
            AND turn_id IN (${placeholders})
        `).run(
          input.uploadedAt,
          input.uploadedAt,
          scope.userId,
          scope.characterId,
          scope.sessionId,
          scope.sessionId,
          ...input.turnIds,
        )

        const currentState = this.getSyncState({ scope: input.scope })

        upsertSyncState({
          generatedFromTurnId: input.turnIds.at(-1) ?? null,
          lastAppliedGeneratedFromTurnId: currentState?.lastAppliedGeneratedFromTurnId ?? null,
          lastAppliedSummaryVersion: currentState?.lastAppliedSummaryVersion ?? 0,
          lastAppliedTurnCheckpoint: currentState?.lastAppliedTurnCheckpoint ?? 0,
          lastLocalTurnCheckpoint: getLastRawTurnCheckpoint(scope),
          lastPullAt: currentState?.lastPullAt ?? null,
          lastSyncedAt: input.uploadedAt,
          lastSyncedTurnId: input.turnIds.at(-1) ?? null,
          lastUploadAt: input.uploadedAt,
          lastUploadedTurnId: input.turnIds.at(-1) ?? null,
          nextPullAt: input.uploadedAt,
          pendingTurnCount: getPendingTurnCount(scope),
          retryCount: 0,
          scope,
          state: 'idle',
          syncCheckpoint: input.uploadedAt,
          updatedAt: input.uploadedAt,
        })
      })
    },

    readPromptContext(input) {
      const preparedStatements = getStatements()
      const scope = toScopeBoundValues(input.scope)
      const profileSummaryRow = preparedStatements.selectCurrentProfileSummaryStatement.get(
        scope.userId,
        scope.characterId,
      ) as ProfileSummaryRow | undefined
      const stableFactRows = preparedStatements.selectStableFactsForPromptContextStatement.all(
        scope.userId,
        scope.characterId,
        scope.sessionId,
        scope.sessionId,
      ) as unknown as StableFactRow[]
      const recentTurnRows = preparedStatements.selectRecentTurnsForPromptContextStatement.all(
        scope.userId,
        scope.characterId,
        scope.sessionId,
        scope.sessionId,
      ) as unknown as RecentTurnRow[]

      return {
        profileSummary: profileSummaryRow ? mapProfileSummaryRow(profileSummaryRow) : null,
        recentTurns: recentTurnRows.map(mapRecentTurnRow),
        stableFacts: stableFactRows.map(mapStableFactRow),
      } satisfies MemoryPromptContext
    },

    pruneUploadedTurns(input) {
      if (!Number.isFinite(input.retentionWindowMs) || input.retentionWindowMs < 0) {
        throw new Error('Memory retention window must be a non-negative finite number.')
      }

      const scope = toScopeBoundValues(input.scope)
      const pruneBefore = input.now - input.retentionWindowMs
      const staleTurnRows = database.prepare(`
        SELECT turn_id
        FROM raw_turn_log
        WHERE scope_user_id = ?
          AND scope_character_id = ?
          AND ((? IS NULL AND scope_session_id IS NULL) OR scope_session_id = ?)
          AND sync_status = 'uploaded'
          AND created_at < ?
        ORDER BY created_at ASC, turn_id ASC
      `).all(
        scope.userId,
        scope.characterId,
        scope.sessionId,
        scope.sessionId,
        pruneBefore,
      ) as Array<{ turn_id: string }>
      const staleTurnIds = staleTurnRows.map(row => row.turn_id)

      if (staleTurnIds.length === 0) {
        return {
          prunedRawTurnCount: 0,
          prunedRecentTurnCount: 0,
        }
      }

      return runInTransaction(database, () => {
        const placeholders = staleTurnIds.map(() => '?').join(', ')
        const recentDeleteResult = database.prepare(`
          DELETE FROM recent_turns
          WHERE scope_user_id = ?
            AND scope_character_id = ?
            AND ((? IS NULL AND scope_session_id IS NULL) OR scope_session_id = ?)
            AND turn_id IN (${placeholders})
        `).run(
          scope.userId,
          scope.characterId,
          scope.sessionId,
          scope.sessionId,
          ...staleTurnIds,
        ) as { changes: number }
        const rawDeleteResult = database.prepare(`
          DELETE FROM raw_turn_log
          WHERE scope_user_id = ?
            AND scope_character_id = ?
            AND ((? IS NULL AND scope_session_id IS NULL) OR scope_session_id = ?)
            AND sync_status = 'uploaded'
            AND turn_id IN (${placeholders})
        `).run(
          scope.userId,
          scope.characterId,
          scope.sessionId,
          scope.sessionId,
          ...staleTurnIds,
        ) as { changes: number }

        return {
          prunedRawTurnCount: rawDeleteResult.changes,
          prunedRecentTurnCount: recentDeleteResult.changes,
        }
      })
    },

    recordRawTurnUploadFailure(input) {
      const scope = toScopeBoundValues(input.scope)

      runInTransaction(database, () => {
        const currentState = this.getSyncState({ scope: input.scope })

        upsertSyncState({
          generatedFromTurnId: currentState?.generatedFromTurnId ?? null,
          lastAppliedGeneratedFromTurnId: currentState?.lastAppliedGeneratedFromTurnId ?? null,
          lastAppliedSummaryVersion: currentState?.lastAppliedSummaryVersion ?? 0,
          lastAppliedTurnCheckpoint: currentState?.lastAppliedTurnCheckpoint ?? 0,
          lastError: input.error,
          lastLocalTurnCheckpoint: getLastRawTurnCheckpoint(scope),
          lastPullAt: currentState?.lastPullAt ?? null,
          lastSyncedAt: currentState?.lastSyncedAt ?? null,
          lastSyncedTurnId: currentState?.lastSyncedTurnId ?? null,
          lastUploadAt: currentState?.lastUploadAt ?? null,
          lastUploadedTurnId: currentState?.lastUploadedTurnId ?? null,
          nextPullAt: currentState?.nextPullAt ?? null,
          nextRetryAt: input.nextRetryAt,
          pendingTurnCount: getPendingTurnCount(scope),
          retryCount: (currentState?.retryCount ?? 0) + 1,
          scope,
          state: 'error',
          syncCheckpoint: currentState?.syncCheckpoint ?? 0,
          updatedAt: input.failedAt,
        })
      })
    },

    applyMemoryPatch(input) {
      const scope = toScopeBoundValues(input.patch.scope)

      return runInTransaction(database, () => {
        const preparedStatements = getStatements()
        const currentState = this.getSyncState({ scope: input.patch.scope })
        const currentSummary = this.readPromptContext({ scope: input.patch.scope }).profileSummary
        let appliedSummary = false
        let rejectedSummaryReason: ApplyMemoryPatchResult['rejectedSummaryReason'] = null
        let appliedFactsCount = 0
        let appliedMemoryCardCount = 0
        const currentAppliedCheckpoint = currentState?.lastAppliedTurnCheckpoint ?? 0
        const currentSummaryVersion = currentState?.lastAppliedSummaryVersion
          ?? currentSummary?.version
          ?? 0
        const patchGeneratedTurnIds = [
          input.patch.summaryPatch?.generatedFromTurnId ?? null,
          ...(input.patch.factsPatch ?? []).map(fact => fact.generatedFromTurnId),
          ...(input.patch.memoryCards ?? []).map(card => card.generatedFromTurnId ?? null),
        ].filter((turnId): turnId is string => !!turnId)
        const patchGeneratedCheckpoints = patchGeneratedTurnIds
          .map(turnId => resolveTurnCheckpoint(scope, turnId))
          .filter((checkpoint): checkpoint is number => checkpoint !== null)
        const latestPatchCheckpoint = patchGeneratedCheckpoints.length > 0
          ? Math.max(...patchGeneratedCheckpoints)
          : null

        const summaryPatch = input.patch.summaryPatch ?? null
        const isPatchIdempotentNoop = latestPatchCheckpoint !== null
          && latestPatchCheckpoint <= currentAppliedCheckpoint
          && (!summaryPatch || summaryPatch.summaryVersion <= currentSummaryVersion)

        if (isPatchIdempotentNoop) {
          upsertSyncState({
            generatedFromTurnId: currentState?.generatedFromTurnId ?? null,
            lastAppliedGeneratedFromTurnId: currentState?.lastAppliedGeneratedFromTurnId ?? null,
            lastAppliedSummaryVersion: currentState?.lastAppliedSummaryVersion ?? 0,
            lastAppliedTurnCheckpoint: currentAppliedCheckpoint,
            lastError: null,
            lastLocalTurnCheckpoint: getLastRawTurnCheckpoint(scope),
            lastPullAt: input.pulledAt,
            lastSyncedAt: currentState?.lastSyncedAt ?? null,
            lastSyncedTurnId: currentState?.lastSyncedTurnId ?? null,
            lastUploadAt: currentState?.lastUploadAt ?? null,
            lastUploadedTurnId: currentState?.lastUploadedTurnId ?? null,
            nextPullAt: input.nextPullAt,
            nextRetryAt: currentState?.nextRetryAt ?? null,
            pendingTurnCount: getPendingTurnCount(scope),
            retryCount: 0,
            scope,
            state: 'idle',
            syncCheckpoint: currentState?.syncCheckpoint ?? 0,
            updatedAt: input.pulledAt,
          })

          return {
            appliedFactsCount: 0,
            appliedMemoryCardCount: 0,
            appliedSummary: false,
            rejectedSummaryReason: summaryPatch
              ? (summaryPatch.summaryVersion <= currentSummaryVersion
                  ? 'outdated-summary-version'
                  : 'outdated-generated-from-turn')
              : null,
          } satisfies ApplyMemoryPatchResult
        }

        if (summaryPatch) {
          const generatedCheckpoint = resolveTurnCheckpoint(scope, summaryPatch.generatedFromTurnId)

          if (summaryPatch.summaryVersion <= currentSummaryVersion) {
            rejectedSummaryReason = 'outdated-summary-version'
          }
          else if (generatedCheckpoint !== null && generatedCheckpoint < currentAppliedCheckpoint) {
            rejectedSummaryReason = 'outdated-generated-from-turn'
          }
          else {
            const currentSummaryRow = preparedStatements.selectCurrentProfileSummaryStatement.get(
              scope.userId,
              scope.characterId,
            ) as ProfileSummaryRow | undefined
            const nextId = randomUUID()

            if (currentSummaryRow) {
              preparedStatements.supersedeProfileSummaryStatement.run(nextId, input.pulledAt, currentSummaryRow.id)
            }

            preparedStatements.insertProfileSummaryStatement.run(
              nextId,
              scope.userId,
              scope.characterId,
              scope.sessionId,
              summaryPatch.summaryVersion,
              summaryPatch.summaryMarkdown,
              summaryPatch.generatedFromTurnId,
              summaryPatch.confidence ?? 1,
              null,
              input.pulledAt,
              input.pulledAt,
            )
            appliedSummary = true
          }
        }

        for (const factPatch of input.patch.factsPatch ?? []) {
          applyFactPatch({
            factPatch,
            scope,
            updatedAt: input.pulledAt,
          })
          appliedFactsCount += 1
        }

        for (const memoryCardPatch of input.patch.memoryCards ?? []) {
          preparedStatements.upsertMemoryCardStatement.run(
            memoryCardPatch.id,
            scope.userId,
            scope.characterId,
            scope.sessionId,
            1,
            memoryCardPatch.title,
            memoryCardPatch.content,
            memoryCardPatch.generatedFromTurnId ?? null,
            memoryCardPatch.confidence ?? 1,
            null,
            input.pulledAt,
            input.pulledAt,
          )
          appliedMemoryCardCount += 1
        }

        const summaryGeneratedTurnId = summaryPatch?.generatedFromTurnId ?? currentState?.lastAppliedGeneratedFromTurnId ?? null
        const summaryGeneratedCheckpoint = appliedSummary
          ? (resolveTurnCheckpoint(scope, summaryPatch?.generatedFromTurnId) ?? currentAppliedCheckpoint)
          : currentAppliedCheckpoint

        upsertSyncState({
          generatedFromTurnId: currentState?.generatedFromTurnId ?? null,
          lastAppliedGeneratedFromTurnId: summaryGeneratedTurnId,
          lastAppliedSummaryVersion: appliedSummary
            ? (summaryPatch?.summaryVersion ?? currentState?.lastAppliedSummaryVersion ?? 0)
            : (currentState?.lastAppliedSummaryVersion ?? 0),
          lastAppliedTurnCheckpoint: summaryGeneratedCheckpoint,
          lastError: rejectedSummaryReason || null,
          lastLocalTurnCheckpoint: getLastRawTurnCheckpoint(scope),
          lastPullAt: input.pulledAt,
          lastSyncedAt: currentState?.lastSyncedAt ?? null,
          lastSyncedTurnId: currentState?.lastSyncedTurnId ?? null,
          lastUploadAt: currentState?.lastUploadAt ?? null,
          lastUploadedTurnId: currentState?.lastUploadedTurnId ?? null,
          nextPullAt: input.nextPullAt,
          nextRetryAt: currentState?.nextRetryAt ?? null,
          pendingTurnCount: getPendingTurnCount(scope),
          retryCount: 0,
          scope,
          state: 'idle',
          syncCheckpoint: currentState?.syncCheckpoint ?? 0,
          updatedAt: input.pulledAt,
        })

        return {
          appliedFactsCount,
          appliedMemoryCardCount,
          appliedSummary,
          rejectedSummaryReason,
        } satisfies ApplyMemoryPatchResult
      })
    },

    recordMemoryPatchPullFailure(input) {
      const scope = toScopeBoundValues(input.scope)

      runInTransaction(database, () => {
        const currentState = this.getSyncState({ scope: input.scope })

        upsertSyncState({
          generatedFromTurnId: currentState?.generatedFromTurnId ?? null,
          lastAppliedGeneratedFromTurnId: currentState?.lastAppliedGeneratedFromTurnId ?? null,
          lastAppliedSummaryVersion: currentState?.lastAppliedSummaryVersion ?? 0,
          lastAppliedTurnCheckpoint: currentState?.lastAppliedTurnCheckpoint ?? 0,
          lastError: input.error,
          lastLocalTurnCheckpoint: getLastRawTurnCheckpoint(scope),
          lastPullAt: currentState?.lastPullAt ?? null,
          lastSyncedAt: currentState?.lastSyncedAt ?? null,
          lastSyncedTurnId: currentState?.lastSyncedTurnId ?? null,
          lastUploadAt: currentState?.lastUploadAt ?? null,
          lastUploadedTurnId: currentState?.lastUploadedTurnId ?? null,
          nextPullAt: input.nextPullAt,
          nextRetryAt: currentState?.nextRetryAt ?? null,
          pendingTurnCount: getPendingTurnCount(scope),
          retryCount: currentState?.retryCount ?? 0,
          scope,
          state: 'error',
          syncCheckpoint: currentState?.syncCheckpoint ?? 0,
          updatedAt: input.failedAt,
        })
      })
    },

    replaceProfileSummary(input) {
      const preparedStatements = getStatements()
      const scope = toScopeBoundValues(input.scope)
      const currentRow = preparedStatements.selectCurrentProfileSummaryStatement.get(
        scope.userId,
        scope.characterId,
      ) as ProfileSummaryRow | undefined
      const nextId = randomUUID()
      const nextVersion = (currentRow?.version ?? 0) + 1

      runInTransaction(database, () => {
        if (currentRow) {
          preparedStatements.supersedeProfileSummaryStatement.run(nextId, input.updatedAt, currentRow.id)
        }

        preparedStatements.insertProfileSummaryStatement.run(
          nextId,
          scope.userId,
          scope.characterId,
          scope.sessionId,
          nextVersion,
          input.summaryMarkdown,
          input.generatedFromTurnId ?? null,
          input.confidence ?? 1,
          null,
          input.updatedAt,
          input.updatedAt,
        )
      })

      return {
        confidence: input.confidence ?? 1,
        createdAt: input.updatedAt,
        generatedFromTurnId: input.generatedFromTurnId ?? null,
        id: nextId,
        scope: {
          characterId: scope.characterId,
          sessionId: scope.sessionId,
          userId: scope.userId,
        },
        summaryMarkdown: input.summaryMarkdown,
        supersededBy: null,
        updatedAt: input.updatedAt,
        version: nextVersion,
      }
    },

    upsertStableFact(input) {
      const preparedStatements = getStatements()
      const scope = toScopeBoundValues(input.scope)
      const currentRow = preparedStatements.selectCurrentStableFactStatement.get(
        scope.userId,
        scope.characterId,
        scope.sessionId,
        scope.sessionId,
        input.factKey,
      ) as StableFactRow | undefined
      const nextId = randomUUID()
      const nextVersion = (currentRow?.version ?? 0) + 1

      runInTransaction(database, () => {
        if (currentRow) {
          preparedStatements.supersedeStableFactStatement.run(nextId, input.updatedAt, currentRow.id)
        }

        preparedStatements.insertStableFactStatement.run(
          nextId,
          scope.userId,
          scope.characterId,
          scope.sessionId,
          nextVersion,
          input.factKey,
          input.factValue,
          input.generatedFromTurnId ?? null,
          input.confidence ?? 1,
          null,
          input.updatedAt,
          input.updatedAt,
        )
      })

      return {
        confidence: input.confidence ?? 1,
        createdAt: input.updatedAt,
        factKey: input.factKey,
        factValue: input.factValue,
        generatedFromTurnId: input.generatedFromTurnId ?? null,
        id: nextId,
        scope: {
          characterId: scope.characterId,
          sessionId: scope.sessionId,
          userId: scope.userId,
        },
        supersededBy: null,
        updatedAt: input.updatedAt,
        version: nextVersion,
      }
    },
  }
}
