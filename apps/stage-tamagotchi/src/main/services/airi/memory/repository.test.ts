import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import { afterEach, describe, expect, it } from 'vitest'

import { createMemoryRepository } from './repository'

function createTempDatabasePath() {
  // NOTICE:
  // Tests use a real file-backed SQLite database so we can verify persisted rows
  // through a second connection without exposing repository internals.
  // Root cause: Phase 2 requires validating table state, supersede chains, and
  // transaction side effects directly in SQLite.
  // Source/context: node:sqlite DatabaseSync supports file-backed paths and
  // synchronous access in the current Node runtime.
  // Removal condition: Safe to remove if repository tests no longer need direct
  // SQLite inspection or if a dedicated test helper becomes available.
  const directoryPath = mkdtempSync(join(tmpdir(), 'airi-memory-repository-'))

  return {
    cleanup: () => rmSync(directoryPath, { force: true, recursive: true }),
    databasePath: join(directoryPath, 'memory.sqlite'),
  }
}

describe('memory repository', () => {
  const cleanupCallbacks: Array<() => void> = []

  afterEach(() => {
    for (const cleanup of cleanupCallbacks.splice(0)) {
      cleanup()
    }
  })

  it('initializes the Phase 2 SQLite schema successfully', () => {
    const tempDatabase = createTempDatabasePath()
    cleanupCallbacks.push(tempDatabase.cleanup)

    const repository = createMemoryRepository({ databasePath: tempDatabase.databasePath })
    repository.initialize()
    repository.close()

    const database = new DatabaseSync(tempDatabase.databasePath)
    const tables = database.prepare(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'table'
        AND name IN ('profile_summary', 'stable_facts', 'recent_turns', 'raw_turn_log', 'memory_cards', 'sync_state')
      ORDER BY name
    `).all() as Array<{ name: string }>

    const rawTurnLogColumns = database.prepare('PRAGMA table_info(raw_turn_log)').all() as Array<{ name: string }>

    expect(tables).toEqual([
      { name: 'memory_cards' },
      { name: 'profile_summary' },
      { name: 'raw_turn_log' },
      { name: 'recent_turns' },
      { name: 'stable_facts' },
      { name: 'sync_state' },
    ])
    expect(rawTurnLogColumns.some(column => column.name === 'sync_status')).toBe(true)

    database.close()
  })

  it('appends one turn into raw_turn_log and recent_turns with pending sync status', () => {
    const tempDatabase = createTempDatabasePath()
    cleanupCallbacks.push(tempDatabase.cleanup)

    const repository = createMemoryRepository({ databasePath: tempDatabase.databasePath })
    repository.initialize()

    repository.appendTurn({
      createdAt: 1_000,
      rawPayload: { content: 'hello', role: 'user' },
      role: 'user',
      scope: {
        characterId: 'character-a',
        sessionId: 'session-a',
        userId: 'user-a',
      },
      text: 'hello',
      turnId: 'turn-1',
    })
    repository.close()

    const database = new DatabaseSync(tempDatabase.databasePath)
    const rawTurnRow = database.prepare(`
      SELECT turn_id, role, raw_payload_json, sync_status
      FROM raw_turn_log
      WHERE turn_id = ?
    `).get('turn-1') as {
      raw_payload_json: string
      role: string
      sync_status: string
      turn_id: string
    }
    const recentTurnRow = database.prepare(`
      SELECT turn_id, role, turn_text
      FROM recent_turns
      WHERE turn_id = ?
    `).get('turn-1') as {
      role: string
      turn_id: string
      turn_text: string
    }

    expect(rawTurnRow.turn_id).toBe('turn-1')
    expect(rawTurnRow.role).toBe('user')
    expect(rawTurnRow.sync_status).toBe('pending')
    expect(JSON.parse(rawTurnRow.raw_payload_json)).toEqual({ content: 'hello', role: 'user' })
    expect(recentTurnRow).toEqual({
      role: 'user',
      turn_id: 'turn-1',
      turn_text: 'hello',
    })

    database.close()
  })

  it('replaces the current profile summary for the same user and character', () => {
    const tempDatabase = createTempDatabasePath()
    cleanupCallbacks.push(tempDatabase.cleanup)

    const repository = createMemoryRepository({ databasePath: tempDatabase.databasePath })
    repository.initialize()

    const firstSummary = repository.replaceProfileSummary({
      confidence: 0.4,
      generatedFromTurnId: 'turn-1',
      scope: {
        characterId: 'character-a',
        sessionId: 'session-a',
        userId: 'user-a',
      },
      summaryMarkdown: 'First summary',
      updatedAt: 1_000,
    })
    const secondSummary = repository.replaceProfileSummary({
      confidence: 0.9,
      generatedFromTurnId: 'turn-2',
      scope: {
        characterId: 'character-a',
        sessionId: 'session-b',
        userId: 'user-a',
      },
      summaryMarkdown: 'Second summary',
      updatedAt: 2_000,
    })

    const promptContext = repository.readPromptContext({
      scope: {
        characterId: 'character-a',
        sessionId: 'session-b',
        userId: 'user-a',
      },
    })
    repository.close()

    const database = new DatabaseSync(tempDatabase.databasePath)
    const summaryRows = database.prepare(`
      SELECT id, summary_markdown, superseded_by, version
      FROM profile_summary
      ORDER BY created_at ASC
    `).all() as Array<{
      id: string
      summary_markdown: string
      superseded_by: string | null
      version: number
    }>

    expect(promptContext.profileSummary?.id).toBe(secondSummary.id)
    expect(promptContext.profileSummary?.summaryMarkdown).toBe('Second summary')
    expect(summaryRows).toEqual([
      {
        id: firstSummary.id,
        summary_markdown: 'First summary',
        superseded_by: secondSummary.id,
        version: 1,
      },
      {
        id: secondSummary.id,
        summary_markdown: 'Second summary',
        superseded_by: null,
        version: 2,
      },
    ])

    database.close()
  })

  it('supersedes the previous stable fact for the same scoped fact key', () => {
    const tempDatabase = createTempDatabasePath()
    cleanupCallbacks.push(tempDatabase.cleanup)

    const repository = createMemoryRepository({ databasePath: tempDatabase.databasePath })
    repository.initialize()

    const firstFact = repository.upsertStableFact({
      confidence: 0.3,
      factKey: 'favorite-color',
      factValue: 'blue',
      generatedFromTurnId: 'turn-1',
      scope: {
        characterId: 'character-a',
        sessionId: 'session-a',
        userId: 'user-a',
      },
      updatedAt: 1_000,
    })
    const secondFact = repository.upsertStableFact({
      confidence: 0.8,
      factKey: 'favorite-color',
      factValue: 'green',
      generatedFromTurnId: 'turn-2',
      scope: {
        characterId: 'character-a',
        sessionId: 'session-a',
        userId: 'user-a',
      },
      updatedAt: 2_000,
    })

    const promptContext = repository.readPromptContext({
      scope: {
        characterId: 'character-a',
        sessionId: 'session-a',
        userId: 'user-a',
      },
    })
    repository.close()

    const database = new DatabaseSync(tempDatabase.databasePath)
    const factRows = database.prepare(`
      SELECT id, fact_key, fact_value, superseded_by, version
      FROM stable_facts
      ORDER BY created_at ASC
    `).all() as Array<{
      fact_key: string
      fact_value: string
      id: string
      superseded_by: string | null
      version: number
    }>

    expect(promptContext.stableFacts).toEqual([
      expect.objectContaining({
        factKey: 'favorite-color',
        factValue: 'green',
        id: secondFact.id,
      }),
    ])
    expect(factRows).toEqual([
      {
        fact_key: 'favorite-color',
        fact_value: 'blue',
        id: firstFact.id,
        superseded_by: secondFact.id,
        version: 1,
      },
      {
        fact_key: 'favorite-color',
        fact_value: 'green',
        id: secondFact.id,
        superseded_by: null,
        version: 2,
      },
    ])

    database.close()
  })

  it('reads prompt context with current summary, unsuperseded stable facts, and the latest 24 turns in ascending order', () => {
    const tempDatabase = createTempDatabasePath()
    cleanupCallbacks.push(tempDatabase.cleanup)

    const repository = createMemoryRepository({ databasePath: tempDatabase.databasePath })
    repository.initialize()

    repository.replaceProfileSummary({
      confidence: 1,
      generatedFromTurnId: 'turn-summary',
      scope: {
        characterId: 'character-a',
        sessionId: 'session-a',
        userId: 'user-a',
      },
      summaryMarkdown: 'Current summary',
      updatedAt: 500,
    })

    repository.upsertStableFact({
      confidence: 0.4,
      factKey: 'location',
      factValue: 'tokyo',
      generatedFromTurnId: 'turn-fact-1',
      scope: {
        characterId: 'character-a',
        sessionId: 'session-a',
        userId: 'user-a',
      },
      updatedAt: 600,
    })
    repository.upsertStableFact({
      confidence: 0.9,
      factKey: 'location',
      factValue: 'kyoto',
      generatedFromTurnId: 'turn-fact-2',
      scope: {
        characterId: 'character-a',
        sessionId: 'session-a',
        userId: 'user-a',
      },
      updatedAt: 700,
    })
    repository.upsertStableFact({
      confidence: 0.8,
      factKey: 'hobby',
      factValue: 'music',
      generatedFromTurnId: 'turn-fact-3',
      scope: {
        characterId: 'character-a',
        sessionId: 'session-a',
        userId: 'user-a',
      },
      updatedAt: 800,
    })
    repository.upsertStableFact({
      confidence: 1,
      factKey: 'ignored-other-scope',
      factValue: 'ignore-me',
      generatedFromTurnId: 'turn-fact-4',
      scope: {
        characterId: 'character-a',
        sessionId: 'session-b',
        userId: 'user-a',
      },
      updatedAt: 900,
    })

    for (let turnNumber = 1; turnNumber <= 26; turnNumber += 1) {
      repository.appendTurn({
        createdAt: turnNumber * 100,
        rawPayload: { order: turnNumber },
        role: turnNumber % 2 === 0 ? 'assistant' : 'user',
        scope: {
          characterId: 'character-a',
          sessionId: 'session-a',
          userId: 'user-a',
        },
        text: `turn-${turnNumber}`,
        turnId: `turn-${turnNumber}`,
      })
    }

    repository.appendTurn({
      createdAt: 99_999,
      rawPayload: { order: 'other-scope' },
      role: 'user',
      scope: {
        characterId: 'character-a',
        sessionId: 'session-b',
        userId: 'user-a',
      },
      text: 'ignore-other-scope',
      turnId: 'turn-other-scope',
    })

    const promptContext = repository.readPromptContext({
      scope: {
        characterId: 'character-a',
        sessionId: 'session-a',
        userId: 'user-a',
      },
    })
    repository.close()

    expect(promptContext.profileSummary?.summaryMarkdown).toBe('Current summary')
    expect(promptContext.stableFacts.map(fact => `${fact.factKey}:${fact.factValue}`)).toEqual([
      'hobby:music',
      'location:kyoto',
    ])
    expect(promptContext.recentTurns).toHaveLength(24)
    expect(promptContext.recentTurns[0]?.turnId).toBe('turn-3')
    expect(promptContext.recentTurns[0]?.text).toBe('turn-3')
    expect(promptContext.recentTurns[23]?.turnId).toBe('turn-26')
    expect(promptContext.recentTurns.map(turn => turn.turnId)).toEqual(
      Array.from({ length: 24 }, (_, index) => `turn-${index + 3}`),
    )
  })

  it('returns null sync state when no row exists for the scope', () => {
    const tempDatabase = createTempDatabasePath()
    cleanupCallbacks.push(tempDatabase.cleanup)

    const repository = createMemoryRepository({ databasePath: tempDatabase.databasePath })
    repository.initialize()

    expect(repository.getSyncState({
      scope: {
        characterId: 'character-a',
        sessionId: 'session-a',
        userId: 'user-a',
      },
    })).toBeNull()

    repository.close()
  })

  it('lists pending raw turns ordered by time and filtered by scope', () => {
    const tempDatabase = createTempDatabasePath()
    cleanupCallbacks.push(tempDatabase.cleanup)

    const repository = createMemoryRepository({ databasePath: tempDatabase.databasePath })
    repository.initialize()

    repository.appendTurn({
      createdAt: 1_000,
      rawPayload: { order: 1 },
      role: 'user',
      scope: {
        characterId: 'character-a',
        sessionId: 'session-a',
        userId: 'user-a',
      },
      text: 'first',
      turnId: 'turn-1',
    })
    repository.appendTurn({
      createdAt: 2_000,
      rawPayload: { order: 2 },
      role: 'assistant',
      scope: {
        characterId: 'character-a',
        sessionId: 'session-a',
        userId: 'user-a',
      },
      text: 'second',
      turnId: 'turn-2',
    })
    repository.appendTurn({
      createdAt: 3_000,
      rawPayload: { order: 3 },
      role: 'user',
      scope: {
        characterId: 'character-a',
        sessionId: 'session-b',
        userId: 'user-a',
      },
      text: 'other-scope',
      turnId: 'turn-3',
    })

    repository.markRawTurnsUploaded({
      scope: {
        characterId: 'character-a',
        sessionId: 'session-a',
        userId: 'user-a',
      },
      turnIds: ['turn-2'],
      uploadedAt: 5_000,
    })

    expect(repository.listPendingRawTurnScopes()).toEqual([
      {
        characterId: 'character-a',
        sessionId: 'session-a',
        userId: 'user-a',
      },
      {
        characterId: 'character-a',
        sessionId: 'session-b',
        userId: 'user-a',
      },
    ])
    expect(repository.listPendingRawTurns({
      scope: {
        characterId: 'character-a',
        sessionId: 'session-a',
        userId: 'user-a',
      },
    })).toEqual([
      expect.objectContaining({
        rawPayload: { order: 1 },
        role: 'user',
        syncStatus: 'pending',
        text: 'first',
        turnId: 'turn-1',
      }),
    ])

    repository.close()
  })

  it('prunes only uploaded turns older than the configurable retention window and keeps long-term memory', () => {
    const tempDatabase = createTempDatabasePath()
    cleanupCallbacks.push(tempDatabase.cleanup)

    const repository = createMemoryRepository({ databasePath: tempDatabase.databasePath })
    repository.initialize()
    const scope = {
      characterId: 'character-a',
      sessionId: 'session-a',
      userId: 'user-a',
    }

    repository.appendTurn({
      createdAt: 1_000,
      rawPayload: { state: 'pending-old' },
      role: 'user',
      scope,
      text: 'pending old',
      turnId: 'turn-pending-old',
    })
    repository.appendTurn({
      createdAt: 2_000,
      rawPayload: { state: 'uploaded-old' },
      role: 'assistant',
      scope,
      text: 'uploaded old',
      turnId: 'turn-uploaded-old',
    })
    repository.appendTurn({
      createdAt: 9_000,
      rawPayload: { state: 'uploaded-new' },
      role: 'user',
      scope,
      text: 'uploaded new',
      turnId: 'turn-uploaded-new',
    })
    repository.markRawTurnsUploaded({
      scope,
      turnIds: ['turn-uploaded-old', 'turn-uploaded-new'],
      uploadedAt: 10_000,
    })
    repository.replaceProfileSummary({
      scope,
      summaryMarkdown: 'Keep summary',
      updatedAt: 11_000,
    })
    repository.upsertStableFact({
      factKey: 'keep',
      factValue: 'fact',
      scope,
      updatedAt: 11_000,
    })
    repository.applyMemoryPatch({
      nextPullAt: 20_000,
      patch: {
        memoryCards: [
          {
            content: 'Keep card',
            id: 'card-keep',
            title: 'Keep Card',
          },
        ],
        scope,
      },
      pulledAt: 11_000,
    })

    const pruneResult = repository.pruneUploadedTurns({
      now: 12_000,
      retentionWindowMs: 5_000,
      scope,
    })

    expect(pruneResult).toEqual({
      prunedRawTurnCount: 1,
      prunedRecentTurnCount: 1,
    })
    expect(repository.listPendingRawTurns({ scope }).map(turn => turn.turnId)).toEqual([
      'turn-pending-old',
    ])
    expect(repository.readPromptContext({ scope }).recentTurns.map(turn => turn.turnId)).toEqual([
      'turn-pending-old',
      'turn-uploaded-new',
    ])
    expect(repository.readPromptContext({ scope })).toEqual(expect.objectContaining({
      profileSummary: expect.objectContaining({
        summaryMarkdown: 'Keep summary',
      }),
      stableFacts: [
        expect.objectContaining({
          factKey: 'keep',
          factValue: 'fact',
        }),
      ],
    }))

    const database = new DatabaseSync(tempDatabase.databasePath)
    const memoryCardCount = (database.prepare(`
      SELECT COUNT(*) AS count
      FROM memory_cards
    `).get() as { count: number }).count
    const rawTurnRows = database.prepare(`
      SELECT turn_id, sync_status
      FROM raw_turn_log
      ORDER BY created_at ASC
    `).all() as Array<{ sync_status: string, turn_id: string }>
    const recentTurnRows = database.prepare(`
      SELECT turn_id
      FROM recent_turns
      ORDER BY created_at ASC
    `).all() as Array<{ turn_id: string }>

    expect(memoryCardCount).toBe(1)
    expect(rawTurnRows).toEqual([
      { sync_status: 'pending', turn_id: 'turn-pending-old' },
      { sync_status: 'uploaded', turn_id: 'turn-uploaded-new' },
    ])
    expect(recentTurnRows).toEqual([
      { turn_id: 'turn-pending-old' },
      { turn_id: 'turn-uploaded-new' },
    ])

    database.close()
    repository.close()
  })

  it('rolls back a patch transaction when a later write fails', () => {
    const tempDatabase = createTempDatabasePath()
    cleanupCallbacks.push(tempDatabase.cleanup)

    const repository = createMemoryRepository({ databasePath: tempDatabase.databasePath })
    repository.initialize()
    const scope = {
      characterId: 'character-a',
      sessionId: 'session-a',
      userId: 'user-a',
    }

    repository.appendTurn({
      createdAt: 1_000,
      rawPayload: { text: 'source' },
      role: 'user',
      scope,
      text: 'source',
      turnId: 'turn-source',
    })

    expect(() => repository.applyMemoryPatch({
      nextPullAt: 3_000,
      patch: {
        factsPatch: [
          {
            confidence: 1,
            factKey: null as unknown as string,
            factValue: 'invalid',
            generatedFromTurnId: 'turn-source',
          },
        ],
        scope,
        summaryPatch: {
          confidence: 1,
          generatedFromTurnId: 'turn-source',
          summaryMarkdown: 'Should roll back',
          summaryVersion: 1,
        },
      },
      pulledAt: 2_000,
    })).toThrow()

    const promptContext = repository.readPromptContext({ scope })
    expect(promptContext.profileSummary).toBeNull()
    expect(promptContext.stableFacts).toEqual([])
    expect(repository.getSyncState({ scope })?.lastPullAt ?? null).toBeNull()

    repository.close()
  })

  it('clears nullable sync error fields when a later update passes null explicitly', () => {
    const tempDatabase = createTempDatabasePath()
    cleanupCallbacks.push(tempDatabase.cleanup)

    const repository = createMemoryRepository({ databasePath: tempDatabase.databasePath })
    repository.initialize()
    const scope = {
      characterId: 'character-a',
      sessionId: 'session-a',
      userId: 'user-a',
    }

    repository.appendTurn({
      createdAt: 1_000,
      rawPayload: { text: 'source' },
      role: 'user',
      scope,
      text: 'source',
      turnId: 'turn-source',
    })
    repository.recordRawTurnUploadFailure({
      error: 'upload failed',
      failedAt: 2_000,
      nextRetryAt: 3_000,
      scope,
    })

    expect(repository.getSyncState({ scope })?.lastError).toBe('upload failed')

    repository.applyMemoryPatch({
      nextPullAt: 5_000,
      patch: { scope },
      pulledAt: 4_000,
    })

    const syncState = repository.getSyncState({ scope })
    expect(syncState?.lastError).toBeNull()
    expect(syncState?.nextRetryAt).toBe(3_000)

    repository.close()
  })

  it('applies a newer memory patch and updates summary, facts, memory cards, and sync state', () => {
    const tempDatabase = createTempDatabasePath()
    cleanupCallbacks.push(tempDatabase.cleanup)

    const repository = createMemoryRepository({ databasePath: tempDatabase.databasePath })
    repository.initialize()

    repository.appendTurn({
      createdAt: 1_000,
      rawPayload: { order: 1 },
      role: 'user',
      scope: {
        characterId: 'character-a',
        sessionId: 'session-a',
        userId: 'user-a',
      },
      text: 'turn-1',
      turnId: 'turn-1',
    })
    repository.appendTurn({
      createdAt: 2_000,
      rawPayload: { order: 2 },
      role: 'assistant',
      scope: {
        characterId: 'character-a',
        sessionId: 'session-a',
        userId: 'user-a',
      },
      text: 'turn-2',
      turnId: 'turn-2',
    })

    const applyResult = repository.applyMemoryPatch({
      nextPullAt: 9_000,
      patch: {
        factsPatch: [
          {
            confidence: 0.8,
            factKey: 'location',
            factValue: 'kyoto',
            generatedFromTurnId: 'turn-2',
          },
        ],
        memoryCards: [
          {
            confidence: 0.7,
            content: 'card body',
            id: 'card-1',
            title: 'Card One',
          },
        ],
        scope: {
          characterId: 'character-a',
          sessionId: 'session-a',
          userId: 'user-a',
        },
        summaryPatch: {
          confidence: 0.9,
          generatedFromTurnId: 'turn-2',
          summaryMarkdown: 'Cloud summary',
          summaryVersion: 2,
        },
      },
      pulledAt: 5_000,
    })

    expect(applyResult).toEqual({
      appliedFactsCount: 1,
      appliedMemoryCardCount: 1,
      appliedSummary: true,
      rejectedSummaryReason: null,
    })
    expect(repository.readPromptContext({
      scope: {
        characterId: 'character-a',
        sessionId: 'session-a',
        userId: 'user-a',
      },
    })).toEqual(expect.objectContaining({
      profileSummary: expect.objectContaining({
        summaryMarkdown: 'Cloud summary',
        version: 2,
      }),
      stableFacts: [
        expect.objectContaining({
          factKey: 'location',
          factValue: 'kyoto',
        }),
      ],
    }))
    expect(repository.getSyncState({
      scope: {
        characterId: 'character-a',
        sessionId: 'session-a',
        userId: 'user-a',
      },
    })).toEqual(expect.objectContaining({
      lastAppliedGeneratedFromTurnId: 'turn-2',
      lastAppliedSummaryVersion: 2,
      lastAppliedTurnCheckpoint: 2_000,
      lastPullAt: 5_000,
      nextPullAt: 9_000,
    }))

    const database = new DatabaseSync(tempDatabase.databasePath)
    const memoryCards = database.prepare(`
      SELECT id, title, content
      FROM memory_cards
      ORDER BY id ASC
    `).all() as Array<{ content: string, id: string, title: string }>

    expect(memoryCards).toEqual([
      {
        content: 'card body',
        id: 'card-1',
        title: 'Card One',
      },
    ])

    database.close()
    repository.close()
  })

  it('rejects an older summary version patch without overwriting newer state', () => {
    const tempDatabase = createTempDatabasePath()
    cleanupCallbacks.push(tempDatabase.cleanup)

    const repository = createMemoryRepository({ databasePath: tempDatabase.databasePath })
    repository.initialize()

    repository.appendTurn({
      createdAt: 2_000,
      rawPayload: { order: 2 },
      role: 'assistant',
      scope: {
        characterId: 'character-a',
        sessionId: 'session-a',
        userId: 'user-a',
      },
      text: 'turn-2',
      turnId: 'turn-2',
    })

    repository.applyMemoryPatch({
      nextPullAt: 9_000,
      patch: {
        scope: {
          characterId: 'character-a',
          sessionId: 'session-a',
          userId: 'user-a',
        },
        summaryPatch: {
          confidence: 0.9,
          generatedFromTurnId: 'turn-2',
          summaryMarkdown: 'Newer summary',
          summaryVersion: 3,
        },
      },
      pulledAt: 5_000,
    })

    const applyResult = repository.applyMemoryPatch({
      nextPullAt: 10_000,
      patch: {
        scope: {
          characterId: 'character-a',
          sessionId: 'session-a',
          userId: 'user-a',
        },
        summaryPatch: {
          confidence: 0.5,
          generatedFromTurnId: 'turn-2',
          summaryMarkdown: 'Older summary',
          summaryVersion: 2,
        },
      },
      pulledAt: 6_000,
    })

    expect(applyResult).toEqual({
      appliedFactsCount: 0,
      appliedMemoryCardCount: 0,
      appliedSummary: false,
      rejectedSummaryReason: 'outdated-summary-version',
    })
    expect(repository.readPromptContext({
      scope: {
        characterId: 'character-a',
        sessionId: 'session-a',
        userId: 'user-a',
      },
    }).profileSummary?.summaryMarkdown).toBe('Newer summary')

    repository.close()
  })

  it('rejects a summary patch generated from an older turn than the applied checkpoint', () => {
    const tempDatabase = createTempDatabasePath()
    cleanupCallbacks.push(tempDatabase.cleanup)

    const repository = createMemoryRepository({ databasePath: tempDatabase.databasePath })
    repository.initialize()

    repository.appendTurn({
      createdAt: 1_000,
      rawPayload: { order: 1 },
      role: 'user',
      scope: {
        characterId: 'character-a',
        sessionId: 'session-a',
        userId: 'user-a',
      },
      text: 'turn-1',
      turnId: 'turn-1',
    })
    repository.appendTurn({
      createdAt: 2_000,
      rawPayload: { order: 2 },
      role: 'assistant',
      scope: {
        characterId: 'character-a',
        sessionId: 'session-a',
        userId: 'user-a',
      },
      text: 'turn-2',
      turnId: 'turn-2',
    })

    repository.applyMemoryPatch({
      nextPullAt: 9_000,
      patch: {
        scope: {
          characterId: 'character-a',
          sessionId: 'session-a',
          userId: 'user-a',
        },
        summaryPatch: {
          confidence: 0.9,
          generatedFromTurnId: 'turn-2',
          summaryMarkdown: 'Current summary',
          summaryVersion: 3,
        },
      },
      pulledAt: 5_000,
    })

    const applyResult = repository.applyMemoryPatch({
      nextPullAt: 10_000,
      patch: {
        scope: {
          characterId: 'character-a',
          sessionId: 'session-a',
          userId: 'user-a',
        },
        summaryPatch: {
          confidence: 1,
          generatedFromTurnId: 'turn-1',
          summaryMarkdown: 'Stale turn summary',
          summaryVersion: 4,
        },
      },
      pulledAt: 6_000,
    })

    expect(applyResult).toEqual({
      appliedFactsCount: 0,
      appliedMemoryCardCount: 0,
      appliedSummary: false,
      rejectedSummaryReason: 'outdated-generated-from-turn',
    })
    expect(repository.readPromptContext({
      scope: {
        characterId: 'character-a',
        sessionId: 'session-a',
        userId: 'user-a',
      },
    }).profileSummary?.summaryMarkdown).toBe('Current summary')

    repository.close()
  })

  it('merges patched facts through supersede chains and upserts memory cards', () => {
    const tempDatabase = createTempDatabasePath()
    cleanupCallbacks.push(tempDatabase.cleanup)

    const repository = createMemoryRepository({ databasePath: tempDatabase.databasePath })
    repository.initialize()

    repository.appendTurn({
      createdAt: 1_000,
      rawPayload: { order: 1 },
      role: 'user',
      scope: {
        characterId: 'character-a',
        sessionId: 'session-a',
        userId: 'user-a',
      },
      text: 'turn-1',
      turnId: 'turn-1',
    })
    repository.appendTurn({
      createdAt: 2_000,
      rawPayload: { order: 2 },
      role: 'assistant',
      scope: {
        characterId: 'character-a',
        sessionId: 'session-a',
        userId: 'user-a',
      },
      text: 'turn-2',
      turnId: 'turn-2',
    })

    repository.upsertStableFact({
      confidence: 0.5,
      factKey: 'favorite-color',
      factValue: 'blue',
      generatedFromTurnId: 'turn-1',
      scope: {
        characterId: 'character-a',
        sessionId: 'session-a',
        userId: 'user-a',
      },
      updatedAt: 1_500,
    })

    repository.applyMemoryPatch({
      nextPullAt: 9_000,
      patch: {
        factsPatch: [
          {
            confidence: 0.9,
            factKey: 'favorite-color',
            factValue: 'green',
            generatedFromTurnId: 'turn-2',
          },
        ],
        memoryCards: [
          {
            confidence: 0.4,
            content: 'old card body',
            id: 'card-1',
            title: 'Old Card',
          },
        ],
        scope: {
          characterId: 'character-a',
          sessionId: 'session-a',
          userId: 'user-a',
        },
      },
      pulledAt: 5_000,
    })

    const applyResult = repository.applyMemoryPatch({
      nextPullAt: 10_000,
      patch: {
        factsPatch: [
          {
            confidence: 1,
            factKey: 'favorite-color',
            factValue: 'red',
            generatedFromTurnId: 'turn-2',
          },
        ],
        memoryCards: [
          {
            confidence: 0.8,
            content: 'new card body',
            id: 'card-1',
            title: 'New Card',
          },
        ],
        scope: {
          characterId: 'character-a',
          sessionId: 'session-a',
          userId: 'user-a',
        },
      },
      pulledAt: 6_000,
    })

    expect(applyResult).toEqual({
      appliedFactsCount: 1,
      appliedMemoryCardCount: 1,
      appliedSummary: false,
      rejectedSummaryReason: null,
    })
    expect(repository.readPromptContext({
      scope: {
        characterId: 'character-a',
        sessionId: 'session-a',
        userId: 'user-a',
      },
    }).stableFacts).toEqual([
      expect.objectContaining({
        factKey: 'favorite-color',
        factValue: 'red',
      }),
    ])

    const database = new DatabaseSync(tempDatabase.databasePath)
    const stableFacts = database.prepare(`
      SELECT fact_value, superseded_by
      FROM stable_facts
      WHERE fact_key = 'favorite-color'
      ORDER BY created_at ASC
    `).all() as Array<{ fact_value: string, superseded_by: string | null }>
    const memoryCards = database.prepare(`
      SELECT id, title, content
      FROM memory_cards
      ORDER BY id ASC
    `).all() as Array<{ content: string, id: string, title: string }>

    expect(stableFacts.at(-1)).toEqual({
      fact_value: 'red',
      superseded_by: null,
    })
    expect(stableFacts[0]?.superseded_by).not.toBeNull()
    expect(memoryCards).toEqual([
      {
        content: 'new card body',
        id: 'card-1',
        title: 'New Card',
      },
    ])

    database.close()
    repository.close()
  })
})
