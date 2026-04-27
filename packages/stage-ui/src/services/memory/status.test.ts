import { describe, expect, it } from 'vitest'

import { createMemoryGateway } from './gateway'
import { readMemoryStatusSnapshot } from './status'

describe('memory status snapshot', () => {
  it('maps desktop sync state into a stable read-only status shape', async () => {
    const gateway = {
      appendTurn: async () => ({ schemaVersion: 1, storedTurnId: 'turn-1', syncCheckpoint: 1 }),
      getSyncState: async () => ({
        runtimeMode: 'desktop-local-sqlite' as const,
        schemaVersion: 1,
        scope: {
          characterId: 'character-a',
          sessionId: 'session-a',
          userId: 'user-a',
        },
        syncMode: 'disabled' as const,
        syncModeReason: 'memory sync upload is missing endpoint or auth token',
        syncState: {
          lastAppliedSummaryVersion: 3,
          lastError: 'patch pull failed',
          lastLocalTurnCheckpoint: 10,
          lastPullAt: 2_000,
          lastSyncedAt: 1_500,
          lastUploadAt: 1_000,
          pendingTurnCount: 2,
          remoteCheckpoint: 'remote-1',
          state: 'error' as const,
          syncCheckpoint: 10,
        },
      }),
      readPromptContext: async () => ({
        memoryCards: [],
        profileSummary: null,
        recentTurns: [],
        schemaVersion: 1,
        scope: {
          characterId: 'character-a',
          sessionId: 'session-a',
          userId: 'user-a',
        },
        stableFacts: [],
      }),
    }

    await expect(readMemoryStatusSnapshot({
      gateway,
      runtime: 'desktop',
      scope: {
        characterId: 'character-a',
        sessionId: 'session-a',
        userId: 'user-a',
      },
    })).resolves.toEqual({
      lastAppliedSummaryVersion: 3,
      lastError: 'patch pull failed',
      lastPullAt: 2_000,
      lastUploadAt: 1_000,
      pendingTurnCount: 2,
      runtimeLabel: 'Local-First Memory',
      runtimeMode: 'desktop-local-sqlite',
      syncMessage: 'memory sync upload is missing endpoint or auth token',
      syncMode: 'disabled',
    })
  })

  it('keeps the web stub stable and unavailable', async () => {
    const scope = {
      characterId: 'character-a',
      sessionId: 'session-a',
      userId: 'user-a',
    }
    const gateway = createMemoryGateway({ runtime: 'web' })

    await expect(readMemoryStatusSnapshot({
      gateway,
      runtime: 'web',
      scope,
    })).resolves.toEqual({
      lastAppliedSummaryVersion: null,
      lastError: null,
      lastPullAt: null,
      lastUploadAt: null,
      pendingTurnCount: 0,
      runtimeLabel: 'Memory unavailable',
      runtimeMode: 'web-stub',
      syncMessage: 'memory background sync unavailable',
      syncMode: 'unavailable',
    })
  })
})
