import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { createMemoryRepository } from './repository'
import {
  createMemoryRawTurnSyncAgent,
  evaluateRawTurnSyncTrigger,
} from './sync-agent'

function createTempDatabasePath() {
  const directoryPath = mkdtempSync(join(tmpdir(), 'airi-memory-sync-agent-'))

  return {
    cleanup: () => rmSync(directoryPath, { force: true, recursive: true }),
    databasePath: join(directoryPath, 'memory.sqlite'),
  }
}

describe('memory raw turn sync agent', () => {
  const cleanupCallbacks: Array<() => void> = []

  afterEach(() => {
    for (const cleanup of cleanupCallbacks.splice(0)) {
      cleanup()
    }
  })

  it('evaluates the four upload trigger conditions', () => {
    const scope = {
      characterId: 'character-a',
      sessionId: 'session-a',
      userId: 'user-a',
    }

    expect(evaluateRawTurnSyncTrigger({
      config: {
        charThreshold: 2000,
        idleAfterMs: 8_000,
        oldestPendingAgeMs: 90_000,
        turnCountThreshold: 4,
      },
      now: 10_000,
      pendingTurns: Array.from({ length: 4 }, (_, index) => ({
        createdAt: 1_000 + index,
        rawPayload: null,
        role: 'user' as const,
        scope,
        syncStatus: 'pending' as const,
        text: `turn-${index + 1}`,
        turnId: `turn-${index + 1}`,
        updatedAt: 1_000 + index,
        version: 1,
      })),
    })?.type).toBe('turn-count-threshold')

    expect(evaluateRawTurnSyncTrigger({
      config: {
        charThreshold: 10,
        idleAfterMs: 8_000,
        oldestPendingAgeMs: 90_000,
        turnCountThreshold: 4,
      },
      now: 10_000,
      pendingTurns: [
        {
          createdAt: 1_000,
          rawPayload: null,
          role: 'user',
          scope,
          syncStatus: 'pending',
          text: '01234567890',
          turnId: 'turn-1',
          updatedAt: 1_000,
          version: 1,
        },
      ],
    })?.type).toBe('character-threshold')

    expect(evaluateRawTurnSyncTrigger({
      config: {
        charThreshold: 2000,
        idleAfterMs: 8_000,
        oldestPendingAgeMs: 90_000,
        turnCountThreshold: 4,
      },
      now: 100_000,
      pendingTurns: [
        {
          createdAt: 1_000,
          rawPayload: null,
          role: 'user',
          scope,
          syncStatus: 'pending',
          text: 'old',
          turnId: 'turn-1',
          updatedAt: 1_000,
          version: 1,
        },
      ],
    })?.type).toBe('oldest-turn-age-threshold')

    expect(evaluateRawTurnSyncTrigger({
      config: {
        charThreshold: 2000,
        idleAfterMs: 8_000,
        oldestPendingAgeMs: 90_000,
        turnCountThreshold: 4,
      },
      now: 20_000,
      pendingTurns: [
        {
          createdAt: 10_000,
          rawPayload: null,
          role: 'user',
          scope,
          syncStatus: 'pending',
          text: 'idle',
          turnId: 'turn-1',
          updatedAt: 10_000,
          version: 1,
        },
      ],
    })?.type).toBe('idle-threshold')
  })

  it('uploads incremental pending raw turns when a trigger fires and marks them uploaded', async () => {
    const tempDatabase = createTempDatabasePath()
    cleanupCallbacks.push(tempDatabase.cleanup)

    const repository = createMemoryRepository({ databasePath: tempDatabase.databasePath })
    repository.initialize()

    for (let turnNumber = 1; turnNumber <= 4; turnNumber += 1) {
      repository.appendTurn({
        createdAt: turnNumber * 1_000,
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

    const uploadRawTurns = vi.fn(async () => {})
    const agent = createMemoryRawTurnSyncAgent({
      now: () => 10_000,
      repository,
      uploadClient: { uploadRawTurns },
    })

    await agent.tick()

    expect(uploadRawTurns).toHaveBeenCalledTimes(1)
    expect(uploadRawTurns).toHaveBeenCalledWith(expect.objectContaining({
      scope: {
        characterId: 'character-a',
        sessionId: 'session-a',
        userId: 'user-a',
      },
      trigger: expect.objectContaining({
        type: 'turn-count-threshold',
      }),
      turns: [
        expect.objectContaining({ turnId: 'turn-1', text: 'turn-1', rawPayload: { order: 1 } }),
        expect.objectContaining({ turnId: 'turn-2', text: 'turn-2', rawPayload: { order: 2 } }),
        expect.objectContaining({ turnId: 'turn-3', text: 'turn-3', rawPayload: { order: 3 } }),
        expect.objectContaining({ turnId: 'turn-4', text: 'turn-4', rawPayload: { order: 4 } }),
      ],
    }))
    expect(repository.listPendingRawTurns({
      scope: {
        characterId: 'character-a',
        sessionId: 'session-a',
        userId: 'user-a',
      },
    })).toEqual([])
    expect(repository.getSyncState({
      scope: {
        characterId: 'character-a',
        sessionId: 'session-a',
        userId: 'user-a',
      },
    })).toEqual(expect.objectContaining({
      lastUploadedTurnId: 'turn-4',
      lastUploadAt: 10_000,
      pendingTurnCount: 0,
      state: 'idle',
    }))

    repository.close()
  })

  it('keeps turns pending and records retry state when upload fails', async () => {
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
      text: 'x'.repeat(2_500),
      turnId: 'turn-1',
    })

    const uploadRawTurns = vi.fn(async () => {
      throw new Error('upload failed')
    })
    const agent = createMemoryRawTurnSyncAgent({
      now: () => 10_000,
      repository,
      uploadClient: { uploadRawTurns },
      config: {
        charThreshold: 2_000,
        idleAfterMs: 8_000,
        oldestPendingAgeMs: 90_000,
        pollIntervalMs: 1_000,
        retryDelayMs: 30_000,
        turnCountThreshold: 4,
      },
    })

    await agent.tick()

    expect(uploadRawTurns).toHaveBeenCalledTimes(1)
    expect(repository.listPendingRawTurns({
      scope: {
        characterId: 'character-a',
        sessionId: 'session-a',
        userId: 'user-a',
      },
    })).toHaveLength(1)
    expect(repository.getSyncState({
      scope: {
        characterId: 'character-a',
        sessionId: 'session-a',
        userId: 'user-a',
      },
    })).toEqual(expect.objectContaining({
      lastError: 'upload failed',
      nextRetryAt: 40_000,
      pendingTurnCount: 1,
      retryCount: 1,
      state: 'error',
    }))

    repository.close()
  })

  it('does not re-upload a batch after it has already been marked uploaded', async () => {
    const tempDatabase = createTempDatabasePath()
    cleanupCallbacks.push(tempDatabase.cleanup)

    const repository = createMemoryRepository({ databasePath: tempDatabase.databasePath })
    repository.initialize()

    for (let turnNumber = 1; turnNumber <= 4; turnNumber += 1) {
      repository.appendTurn({
        createdAt: turnNumber * 1_000,
        rawPayload: { order: turnNumber },
        role: 'user',
        scope: {
          characterId: 'character-a',
          sessionId: 'session-a',
          userId: 'user-a',
        },
        text: `turn-${turnNumber}`,
        turnId: `turn-${turnNumber}`,
      })
    }

    const uploadRawTurns = vi.fn(async () => {})
    const agent = createMemoryRawTurnSyncAgent({
      now: () => 10_000,
      repository,
      uploadClient: { uploadRawTurns },
    })

    await agent.tick()
    await agent.tick()

    expect(uploadRawTurns).toHaveBeenCalledTimes(1)

    repository.close()
  })
})
