import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createMemoryRepository } from './repository'
import { setupMemorySyncRuntime } from './runtime'

const onAppReadyMock = vi.hoisted(() => vi.fn())
const onAppBeforeQuitMock = vi.hoisted(() => vi.fn())

vi.mock('../../../libs/bootkit/lifecycle', () => ({
  onAppBeforeQuit: onAppBeforeQuitMock,
  onAppReady: onAppReadyMock,
}))

function createTempDatabasePath() {
  const directoryPath = mkdtempSync(join(tmpdir(), 'airi-memory-sync-runtime-'))

  return {
    cleanup: () => rmSync(directoryPath, { force: true, recursive: true }),
    databasePath: join(directoryPath, 'memory.sqlite'),
  }
}

describe('memory sync runtime', () => {
  const cleanupCallbacks: Array<() => void> = []

  beforeEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  afterEach(() => {
    for (const cleanup of cleanupCallbacks.splice(0)) {
      cleanup()
    }
  })

  it('stays disabled and does not crash when uploader config is missing', () => {
    const tempDatabase = createTempDatabasePath()
    cleanupCallbacks.push(tempDatabase.cleanup)
    const repository = createMemoryRepository({ databasePath: tempDatabase.databasePath })
    repository.initialize()

    const runtime = setupMemorySyncRuntime({
      config: {
        uploader: {
          enabled: true,
          endpointUrl: null,
          authToken: null,
          requestTimeoutMs: 10_000,
        },
      },
      repository,
    })

    expect(runtime.getStatus()).toEqual({
      patch: {
        mode: 'disabled',
        reason: 'memory patch pull is disabled',
      },
      running: false,
      uploader: {
        mode: 'disabled',
        reason: 'memory sync upload is missing endpoint or auth token',
      },
    })

    const startHook = onAppReadyMock.mock.calls[0]?.[0] as (() => void) | undefined
    startHook?.()

    expect(runtime.getStatus().running).toBe(false)

    repository.close()
  })

  it('starts automatic ticking on app ready and stops on app shutdown', async () => {
    vi.useFakeTimers()

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

    let currentTime = 10_000
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
    }))
    const runtime = setupMemorySyncRuntime({
      config: {
        pollIntervalMs: 1_000,
        uploader: {
          enabled: true,
          endpointUrl: 'https://example.com/memory/raw-turns',
          authToken: 'token',
          requestTimeoutMs: 10_000,
        },
      },
      fetchImpl: fetchImpl as unknown as typeof fetch,
      now: () => currentTime,
      repository,
    })

    const startHook = onAppReadyMock.mock.calls[0]?.[0] as (() => void) | undefined
    const stopHook = onAppBeforeQuitMock.mock.calls[0]?.[0] as (() => void) | undefined

    startHook?.()
    expect(runtime.getStatus().running).toBe(true)

    await vi.advanceTimersByTimeAsync(1_000)

    expect(fetchImpl).toHaveBeenCalledTimes(1)
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

    currentTime = 20_000
    stopHook?.()

    expect(runtime.getStatus().running).toBe(false)

    await vi.advanceTimersByTimeAsync(5_000)

    expect(fetchImpl).toHaveBeenCalledTimes(1)

    repository.close()
  })

  it('does not start overlapping automatic ticks while a previous tick is still running', async () => {
    vi.useFakeTimers()

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

    let resolveUpload: ((response: Response) => void) | undefined
    const fetchImpl = vi.fn(() => new Promise<Response>((resolve) => {
      resolveUpload = resolve
    }))
    const runtime = setupMemorySyncRuntime({
      config: {
        pollIntervalMs: 1_000,
        uploader: {
          enabled: true,
          endpointUrl: 'https://example.com/memory/raw-turns',
          authToken: 'token',
          requestTimeoutMs: 10_000,
        },
      },
      fetchImpl: fetchImpl as unknown as typeof fetch,
      now: () => 10_000,
      repository,
    })

    const startHook = onAppReadyMock.mock.calls[0]?.[0] as (() => void) | undefined

    startHook?.()
    await vi.advanceTimersByTimeAsync(1_000)
    await vi.advanceTimersByTimeAsync(5_000)

    expect(runtime.getStatus().running).toBe(true)
    expect(fetchImpl).toHaveBeenCalledTimes(1)

    resolveUpload?.({
      ok: true,
      status: 200,
    } as Response)
    await vi.advanceTimersByTimeAsync(0)

    expect(repository.getSyncState({
      scope: {
        characterId: 'character-a',
        sessionId: 'session-a',
        userId: 'user-a',
      },
    })?.lastUploadedTurnId).toBe('turn-4')

    runtime.stop()
    repository.close()
  })

  it('idle-driven periodic ticks can upload small pending batches', async () => {
    vi.useFakeTimers()

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
      text: 'short',
      turnId: 'turn-1',
    })

    const currentTime = 10_000
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
    }))
    setupMemorySyncRuntime({
      config: {
        idleAfterMs: 8_000,
        pollIntervalMs: 1_000,
        uploader: {
          enabled: true,
          endpointUrl: 'https://example.com/memory/raw-turns',
          authToken: 'token',
          requestTimeoutMs: 10_000,
        },
      },
      fetchImpl: fetchImpl as unknown as typeof fetch,
      now: () => currentTime,
      repository,
    })

    const startHook = onAppReadyMock.mock.calls[0]?.[0] as (() => void) | undefined
    startHook?.()

    await vi.advanceTimersByTimeAsync(1_000)

    expect(fetchImpl).toHaveBeenCalledTimes(1)

    repository.close()
  })

  it('completes one upload then pull cycle and updates local summary and facts', async () => {
    vi.useFakeTimers()

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

    const currentTime = 10_000
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes('/raw-turns')) {
        return { ok: true, status: 200 }
      }

      return {
        json: async () => ({
          factsPatch: [
            {
              confidence: 0.8,
              factKey: 'location',
              factValue: 'kyoto',
              generatedFromTurnId: 'turn-4',
            },
          ],
          scope: {
            characterId: 'character-a',
            sessionId: 'session-a',
            userId: 'user-a',
          },
          summaryPatch: {
            confidence: 0.9,
            generatedFromTurnId: 'turn-4',
            summaryMarkdown: 'Pulled summary',
            summaryVersion: 2,
          },
        }),
        ok: true,
        status: 200,
      }
    })

    setupMemorySyncRuntime({
      config: {
        patch: {
          authToken: 'token',
          enabled: true,
          endpointUrl: 'https://example.com/memory/patch',
          pullIntervalMs: 15_000,
          requestTimeoutMs: 10_000,
          retryDelayMs: 30_000,
        },
        uploader: {
          authToken: 'token',
          enabled: true,
          endpointUrl: 'https://example.com/memory/raw-turns',
          requestTimeoutMs: 10_000,
        },
      },
      fetchImpl: fetchImpl as unknown as typeof fetch,
      now: () => currentTime,
      repository,
    })

    const startHook = onAppReadyMock.mock.calls[0]?.[0] as (() => void) | undefined
    startHook?.()

    await vi.advanceTimersByTimeAsync(1_000)

    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(repository.readPromptContext({
      scope: {
        characterId: 'character-a',
        sessionId: 'session-a',
        userId: 'user-a',
      },
    })).toEqual(expect.objectContaining({
      profileSummary: expect.objectContaining({
        summaryMarkdown: 'Pulled summary',
      }),
      stableFacts: [
        expect.objectContaining({
          factKey: 'location',
          factValue: 'kyoto',
        }),
      ],
    }))

    repository.close()
  })

  it('records pull failure without polluting existing local summary state', async () => {
    vi.useFakeTimers()

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
    repository.applyMemoryPatch({
      nextPullAt: 9_000,
      patch: {
        scope: {
          characterId: 'character-a',
          sessionId: 'session-a',
          userId: 'user-a',
        },
        summaryPatch: {
          confidence: 1,
          generatedFromTurnId: 'turn-1',
          summaryMarkdown: 'Local summary',
          summaryVersion: 2,
        },
      },
      pulledAt: 5_000,
    })

    const currentTime = 10_000
    const fetchImpl = vi.fn(async () => {
      throw new Error('pull failed')
    })

    setupMemorySyncRuntime({
      config: {
        patch: {
          authToken: 'token',
          enabled: true,
          endpointUrl: 'https://example.com/memory/patch',
          pullIntervalMs: 1_000,
          requestTimeoutMs: 10_000,
          retryDelayMs: 30_000,
        },
        uploader: {
          authToken: null,
          enabled: false,
          endpointUrl: null,
          requestTimeoutMs: 10_000,
        },
      },
      fetchImpl: fetchImpl as unknown as typeof fetch,
      now: () => currentTime,
      repository,
    })

    const startHook = onAppReadyMock.mock.calls[0]?.[0] as (() => void) | undefined
    startHook?.()

    await vi.advanceTimersByTimeAsync(1_000)

    expect(repository.readPromptContext({
      scope: {
        characterId: 'character-a',
        sessionId: 'session-a',
        userId: 'user-a',
      },
    }).profileSummary?.summaryMarkdown).toBe('Local summary')
    expect(repository.getSyncState({
      scope: {
        characterId: 'character-a',
        sessionId: 'session-a',
        userId: 'user-a',
      },
    })).toEqual(expect.objectContaining({
      lastError: 'pull failed',
      nextPullAt: 40_000,
    }))

    repository.close()
  })

  it('respects patch retry delay after the first pull failure', async () => {
    vi.useFakeTimers()

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
    repository.markRawTurnsUploaded({
      scope: {
        characterId: 'character-a',
        sessionId: 'session-a',
        userId: 'user-a',
      },
      turnIds: ['turn-1'],
      uploadedAt: 5_000,
    })

    let currentTime = 10_000
    const fetchImpl = vi.fn(async () => {
      throw new Error('pull failed')
    })

    const runtime = setupMemorySyncRuntime({
      config: {
        patch: {
          authToken: 'token',
          enabled: true,
          endpointUrl: 'https://example.com/memory/patch',
          pullIntervalMs: 1_000,
          requestTimeoutMs: 10_000,
          retryDelayMs: 30_000,
        },
        uploader: {
          authToken: null,
          enabled: false,
          endpointUrl: null,
          requestTimeoutMs: 10_000,
        },
      },
      fetchImpl: fetchImpl as unknown as typeof fetch,
      now: () => currentTime,
      repository,
    })

    await runtime.tick()
    currentTime = 20_000
    await runtime.tick()
    currentTime = 40_000
    await runtime.tick()

    expect(fetchImpl).toHaveBeenCalledTimes(2)

    repository.close()
  })
})
