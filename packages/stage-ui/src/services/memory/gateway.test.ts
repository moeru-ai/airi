import { beforeEach, describe, expect, it, vi } from 'vitest'

const defineInvokeMock = vi.hoisted(() => vi.fn())
const createContextMock = vi.hoisted(() => vi.fn(() => ({ context: { key: 'desktop-context' } })))

const memoryContractsMock = vi.hoisted(() => ({
  electronMemoryAppendTurn: { name: 'append-turn-contract' },
  electronMemoryGetSyncState: { name: 'get-sync-state-contract' },
  electronMemoryReadPromptContext: { name: 'read-prompt-context-contract' },
}))

vi.mock('@moeru/eventa', () => ({
  defineInvoke: defineInvokeMock,
}))

vi.mock('@moeru/eventa/adapters/electron/renderer', () => ({
  createContext: createContextMock,
}))

vi.mock('../../../../../apps/stage-tamagotchi/src/shared/eventa/memory', () => memoryContractsMock)

describe('memory gateway', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('desktop gateway calls the three existing memory contracts with passthrough payloads', async () => {
    const readPromptContextInvoke = vi.fn(async payload => ({
      memoryCards: undefined,
      profileSummary: undefined,
      recentTurns: undefined,
      schemaVersion: 1,
      scope: payload.scope,
      stableFacts: undefined,
    }))
    const appendTurnInvoke = vi.fn(async payload => ({
      schemaVersion: 1,
      storedTurnId: payload.turnId,
      syncCheckpoint: 12,
    }))
    const getSyncStateInvoke = vi.fn(async payload => ({
      runtimeMode: 'desktop-local-sqlite',
      schemaVersion: 1,
      scope: payload.scope,
      syncMode: 'enabled',
      syncModeReason: null,
      syncState: undefined,
    }))

    defineInvokeMock.mockImplementation((_context, contract) => {
      if (contract === memoryContractsMock.electronMemoryReadPromptContext)
        return readPromptContextInvoke
      if (contract === memoryContractsMock.electronMemoryAppendTurn)
        return appendTurnInvoke
      if (contract === memoryContractsMock.electronMemoryGetSyncState)
        return getSyncStateInvoke
      throw new Error(`Unexpected contract: ${String((contract as { name?: string })?.name)}`)
    })

    const { createDesktopMemoryGateway } = await import('./desktop-gateway')

    const ipcRenderer = { key: 'ipc-renderer' }
    const gateway = createDesktopMemoryGateway({ ipcRenderer })
    const readRequest = {
      scope: {
        characterId: 'character-a',
        sessionId: 'session-a',
        userId: 'user-a',
      },
    }
    const appendRequest = {
      createdAt: 1000,
      rawPayload: { content: 'hello' },
      role: 'user' as const,
      scope: readRequest.scope,
      text: 'hello',
      turnId: 'turn-1',
    }

    const promptContext = await gateway.readPromptContext(readRequest)
    const appendResult = await gateway.appendTurn(appendRequest)
    const syncStateResult = await gateway.getSyncState(readRequest)

    expect(createContextMock).toHaveBeenCalledTimes(1)
    expect(createContextMock).toHaveBeenCalledWith(ipcRenderer)
    expect(defineInvokeMock).toHaveBeenCalledTimes(3)
    expect(readPromptContextInvoke).toHaveBeenCalledWith(readRequest)
    expect(appendTurnInvoke).toHaveBeenCalledWith(appendRequest)
    expect(getSyncStateInvoke).toHaveBeenCalledWith(readRequest)
    expect(promptContext).toEqual({
      memoryCards: [],
      profileSummary: null,
      recentTurns: [],
      schemaVersion: 1,
      scope: readRequest.scope,
      stableFacts: [],
    })
    expect(appendResult).toEqual({
      schemaVersion: 1,
      storedTurnId: 'turn-1',
      syncCheckpoint: 12,
    })
    expect(syncStateResult).toEqual({
      runtimeMode: 'desktop-local-sqlite',
      schemaVersion: 1,
      scope: readRequest.scope,
      syncMode: 'enabled',
      syncModeReason: null,
      syncState: null,
    })
  })

  it('desktop gateway normalizes returned shared memory values', async () => {
    defineInvokeMock.mockImplementation((_context, contract) => {
      if (contract === memoryContractsMock.electronMemoryReadPromptContext) {
        return async () => ({
          memoryCards: [
            {
              confidence: 0.6,
              content: 'card-content',
              id: 'card-1',
              title: 'Card One',
            },
          ],
          profileSummary: 'Summary',
          recentTurns: [
            {
              createdAt: 1000,
              role: 'assistant',
              text: 'hello back',
              turnId: 'turn-2',
            },
          ],
          schemaVersion: 2,
          scope: {
            characterId: 'character-a',
            sessionId: 'session-a',
            userId: 'user-a',
          },
          stableFacts: [
            {
              confidence: 0.9,
              id: 'fact-1',
              key: 'name',
              value: 'Airi',
            },
          ],
        })
      }

      if (contract === memoryContractsMock.electronMemoryAppendTurn)
        return async () => ({ schemaVersion: 1, storedTurnId: 'turn-1', syncCheckpoint: 5 })

      if (contract === memoryContractsMock.electronMemoryGetSyncState) {
        return async () => ({
          schemaVersion: 3,
          scope: {
            characterId: 'character-a',
            sessionId: 'session-a',
            userId: 'user-a',
          },
          syncState: {
            lastAppliedSummaryVersion: 4,
            lastError: null,
            lastLocalTurnCheckpoint: 8,
            lastPullAt: 3000,
            lastSyncedAt: 2000,
            lastUploadAt: 1000,
            pendingTurnCount: 2,
            remoteCheckpoint: 'remote-1',
            state: 'idle',
            syncCheckpoint: 9,
          },
          syncMode: 'disabled',
          syncModeReason: 'memory sync upload is missing endpoint or auth token',
        })
      }

      throw new Error('Unexpected contract')
    })

    const { createDesktopMemoryGateway } = await import('./desktop-gateway')
    const gateway = createDesktopMemoryGateway({ ipcRenderer: { key: 'ipc-renderer' } })

    await expect(gateway.readPromptContext({
      scope: {
        characterId: 'character-a',
        sessionId: 'session-a',
        userId: 'user-a',
      },
    })).resolves.toEqual({
      memoryCards: [
        {
          confidence: 0.6,
          content: 'card-content',
          id: 'card-1',
          title: 'Card One',
        },
      ],
      profileSummary: 'Summary',
      recentTurns: [
        {
          createdAt: 1000,
          role: 'assistant',
          text: 'hello back',
          turnId: 'turn-2',
        },
      ],
      schemaVersion: 2,
      scope: {
        characterId: 'character-a',
        sessionId: 'session-a',
        userId: 'user-a',
      },
      stableFacts: [
        {
          confidence: 0.9,
          id: 'fact-1',
          key: 'name',
          value: 'Airi',
        },
      ],
    })

    await expect(gateway.getSyncState({
      scope: {
        characterId: 'character-a',
        sessionId: 'session-a',
        userId: 'user-a',
      },
    })).resolves.toEqual({
      runtimeMode: 'desktop-local-sqlite',
      schemaVersion: 3,
      scope: {
        characterId: 'character-a',
        sessionId: 'session-a',
        userId: 'user-a',
      },
      syncMode: 'disabled',
      syncModeReason: 'memory sync upload is missing endpoint or auth token',
      syncState: {
        lastAppliedSummaryVersion: 4,
        lastError: null,
        lastLocalTurnCheckpoint: 8,
        lastPullAt: 3000,
        lastSyncedAt: 2000,
        lastUploadAt: 1000,
        pendingTurnCount: 2,
        remoteCheckpoint: 'remote-1',
        state: 'idle',
        syncCheckpoint: 9,
      },
    })
  })

  it('web stub is stable and does not throw', async () => {
    const { createMemoryGateway } = await import('./gateway')

    const gateway = createMemoryGateway({ runtime: 'web' })
    const scope = {
      characterId: 'character-a',
      sessionId: 'session-a',
      userId: 'user-a',
    }

    await expect(gateway.readPromptContext({ scope })).resolves.toEqual({
      memoryCards: [],
      profileSummary: null,
      recentTurns: [],
      schemaVersion: 0,
      scope,
      stableFacts: [],
    })
    await expect(gateway.appendTurn({
      createdAt: 1000,
      rawPayload: { content: 'hello' },
      role: 'user',
      scope,
      text: 'hello',
      turnId: 'turn-1',
    })).resolves.toEqual({
      schemaVersion: 0,
      storedTurnId: 'turn-1',
      syncCheckpoint: 0,
    })
    await expect(gateway.getSyncState({ scope })).resolves.toEqual({
      runtimeMode: 'web-stub',
      schemaVersion: 0,
      scope,
      syncMode: 'unavailable',
      syncModeReason: 'memory background sync unavailable',
      syncState: null,
    })
  })
})
