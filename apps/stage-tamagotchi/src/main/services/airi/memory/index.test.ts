import type { createContext } from '@moeru/eventa/adapters/electron/main'

import type { MemoryRepository } from './repository'

import { beforeEach, describe, expect, it, vi } from 'vitest'

const defineInvokeHandlerMock = vi.hoisted(() => vi.fn())
const repositoryFactoryMock = vi.hoisted(() => vi.fn())
const onAppBeforeQuitMock = vi.hoisted(() => vi.fn())
const appMock = vi.hoisted(() => ({
  getPath: vi.fn((name: string) => `/tmp/airi/${name}`),
}))

vi.mock('@moeru/eventa', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@moeru/eventa')>()
  return {
    ...actual,
    defineInvokeHandler: defineInvokeHandlerMock,
  }
})

vi.mock('electron', () => ({
  app: appMock,
}))

vi.mock('../../../libs/bootkit/lifecycle', () => ({
  onAppBeforeQuit: onAppBeforeQuitMock,
}))

vi.mock('./repository', () => ({
  createMemoryRepository: repositoryFactoryMock,
}))

type MainContext = ReturnType<typeof createContext>['context']

describe('memory service wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('registers the three memory invoke handlers', async () => {
    const context = { key: 'test-context' } as unknown as MainContext
    const repository = {
      appendTurn: vi.fn(),
      close: vi.fn(),
      getSyncState: vi.fn(),
      initialize: vi.fn(),
      readPromptContext: vi.fn(),
      replaceProfileSummary: vi.fn(),
      upsertStableFact: vi.fn(),
    } as unknown as MemoryRepository
    const {
      electronMemoryAppendTurn,
      electronMemoryGetSyncState,
      electronMemoryReadPromptContext,
    } = await import('../../../../shared/eventa/memory')
    const { createMemoryService } = await import('./index')

    createMemoryService({ context, repository })

    expect(defineInvokeHandlerMock).toHaveBeenCalledTimes(3)
    expect(defineInvokeHandlerMock).toHaveBeenNthCalledWith(1, context, electronMemoryReadPromptContext, expect.any(Function))
    expect(defineInvokeHandlerMock).toHaveBeenNthCalledWith(2, context, electronMemoryAppendTurn, expect.any(Function))
    expect(defineInvokeHandlerMock).toHaveBeenNthCalledWith(3, context, electronMemoryGetSyncState, expect.any(Function))
  })

  it('append-turn handler forwards payload to the repository and returns its result shape', async () => {
    const context = { key: 'test-context' } as unknown as MainContext
    const appendResult = {
      createdAt: 1000,
      role: 'user' as const,
      scope: {
        characterId: 'character-a',
        sessionId: 'session-a',
        userId: 'user-a',
      },
      text: 'hello',
      turnId: 'turn-1',
      updatedAt: 1000,
      version: 1,
    }
    const repository = {
      appendTurn: vi.fn(() => appendResult),
      close: vi.fn(),
      getSyncState: vi.fn(),
      initialize: vi.fn(),
      readPromptContext: vi.fn(),
      replaceProfileSummary: vi.fn(),
      upsertStableFact: vi.fn(),
    } as unknown as MemoryRepository
    const { createMemoryService } = await import('./index')

    createMemoryService({ context, repository })

    const appendHandler = defineInvokeHandlerMock.mock.calls[1]?.[2] as (payload: unknown) => Promise<unknown>
    const payload = {
      createdAt: 1000,
      rawPayload: { content: 'hello' },
      role: 'user',
      scope: {
        characterId: 'character-a',
        sessionId: 'session-a',
        userId: 'user-a',
      },
      text: 'hello',
      turnId: 'turn-1',
    }

    await expect(appendHandler(payload)).resolves.toEqual({
      schemaVersion: 1,
      storedTurnId: 'turn-1',
      syncCheckpoint: 0,
    })
    expect(repository.appendTurn).toHaveBeenCalledWith(payload)
  })

  it('read-prompt-context and get-sync-state handlers return repository results', async () => {
    const context = { key: 'test-context' } as unknown as MainContext
    const promptContext = {
      profileSummary: {
        confidence: 0.8,
        createdAt: 1000,
        generatedFromTurnId: 'turn-summary',
        id: 'summary-1',
        scope: {
          characterId: 'character-a',
          sessionId: 'session-a',
          userId: 'user-a',
        },
        summaryMarkdown: 'Summary',
        supersededBy: null,
        updatedAt: 1000,
        version: 1,
      },
      recentTurns: [
        {
          createdAt: 1000,
          role: 'user' as const,
          scope: {
            characterId: 'character-a',
            sessionId: 'session-a',
            userId: 'user-a',
          },
          text: 'hello',
          turnId: 'turn-1',
          updatedAt: 1000,
          version: 1,
        },
      ],
      stableFacts: [
        {
          confidence: 0.7,
          createdAt: 1000,
          factKey: 'name',
          factValue: 'Airi',
          generatedFromTurnId: 'turn-fact',
          id: 'fact-1',
          scope: {
            characterId: 'character-a',
            sessionId: 'session-a',
            userId: 'user-a',
          },
          supersededBy: null,
          updatedAt: 1000,
          version: 1,
        },
      ],
    }
    const syncState = null
    const repository = {
      appendTurn: vi.fn(),
      close: vi.fn(),
      getSyncState: vi.fn(() => syncState),
      initialize: vi.fn(),
      readPromptContext: vi.fn(() => promptContext),
      replaceProfileSummary: vi.fn(),
      upsertStableFact: vi.fn(),
    } as unknown as MemoryRepository
    const { createMemoryService } = await import('./index')

    createMemoryService({ context, repository })

    const readPromptContextHandler = defineInvokeHandlerMock.mock.calls[0]?.[2] as (payload: unknown) => Promise<unknown>
    const getSyncStateHandler = defineInvokeHandlerMock.mock.calls[2]?.[2] as (payload: unknown) => Promise<unknown>
    const request = {
      scope: {
        characterId: 'character-a',
        sessionId: 'session-a',
        userId: 'user-a',
      },
    }

    await expect(readPromptContextHandler(request)).resolves.toEqual({
      memoryCards: [],
      profileSummary: 'Summary',
      recentTurns: [
        {
          createdAt: 1000,
          role: 'user',
          text: 'hello',
          turnId: 'turn-1',
        },
      ],
      schemaVersion: 1,
      scope: request.scope,
      stableFacts: [
        {
          confidence: 0.7,
          id: 'fact-1',
          key: 'name',
          value: 'Airi',
        },
      ],
    })
    await expect(getSyncStateHandler(request)).resolves.toEqual({
      runtimeMode: 'desktop-local-sqlite',
      schemaVersion: 1,
      scope: request.scope,
      syncMode: 'enabled',
      syncModeReason: null,
      syncState: null,
    })
    expect(repository.readPromptContext).toHaveBeenCalledWith(request)
    expect(repository.getSyncState).toHaveBeenCalledWith(request)
  })

  it('setupMemoryRepository creates one singleton repository and initializes it only once', async () => {
    const close = vi.fn()
    const initialize = vi.fn()
    const repository = {
      appendTurn: vi.fn(),
      close,
      getSyncState: vi.fn(),
      initialize,
      readPromptContext: vi.fn(),
      replaceProfileSummary: vi.fn(),
      upsertStableFact: vi.fn(),
    } as unknown as MemoryRepository

    repositoryFactoryMock.mockReturnValue(repository)

    const { setupMemoryRepository } = await import('./index')

    const firstRepository = setupMemoryRepository()
    const secondRepository = setupMemoryRepository()

    expect(firstRepository).toBe(repository)
    expect(secondRepository).toBe(repository)
    expect(repositoryFactoryMock).toHaveBeenCalledTimes(1)
    expect(repositoryFactoryMock).toHaveBeenCalledWith({
      databasePath: '/tmp/airi/userData/memory.sqlite',
    })
    expect(initialize).toHaveBeenCalledTimes(1)
    expect(onAppBeforeQuitMock).toHaveBeenCalledTimes(1)

    const cleanup = onAppBeforeQuitMock.mock.calls[0]?.[0] as (() => void) | undefined
    cleanup?.()

    expect(close).toHaveBeenCalledTimes(1)
  })
})
