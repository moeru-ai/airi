import type { ChatProvider } from '@xsai-ext/providers/utils'
import type { Message } from '@xsai/shared-chat'

import type { MemoryGateway } from '../services/memory/gateway'

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

import { createMemoryRepository } from '../../../../apps/stage-tamagotchi/src/main/services/airi/memory/repository'
import { setupMemorySyncRuntime } from '../../../../apps/stage-tamagotchi/src/main/services/airi/memory/runtime'
import { readMemoryStatusSnapshot } from '../services/memory/status'
import { useChatOrchestratorStore } from './chat'

const llmStreamMock = vi.fn()
const trackFirstMessageMock = vi.fn()
const ingestContextMessageMock = vi.fn()
const getContextsSnapshotMock = vi.fn()
const createMinecraftContextMock = vi.fn()
const persistSessionMessagesMock = vi.fn()
const forkSessionMock = vi.fn()
const ensureSessionMock = vi.fn()
const parserConsumeMock = vi.fn()
const parserEndMock = vi.fn()
const createMemoryGatewayMock = vi.hoisted(() => vi.fn())

const activeSessionIdRef = ref('session-1')
const streamingMessageRef = ref<any>({ role: 'assistant', content: '', slices: [], tool_results: [] })
const sessionMessages: Record<string, any[]> = {}
let currentGeneration = 1

vi.mock('pinia', async () => {
  const actual = await vi.importActual<typeof import('pinia')>('pinia')
  return {
    ...actual,
    storeToRefs: (store: any) => store,
  }
})

vi.mock('@proj-airi/stream-kit', () => ({
  createQueue: ({ handlers }: { handlers: Array<(ctx: { data: any }) => Promise<void> | void> }) => {
    const enqueueListeners: Array<(data: any) => void> = []
    const dequeueListeners: Array<(data: any) => void> = []

    return {
      enqueue(data: any) {
        for (const listener of enqueueListeners)
          listener(data)

        queueMicrotask(async () => {
          try {
            for (const handler of handlers) {
              await handler({ data })
            }
          }
          finally {
            for (const listener of dequeueListeners)
              listener(data)
          }
        })
      },
      on(event: 'enqueue' | 'dequeue', listener: (data: any) => void) {
        if (event === 'enqueue') {
          enqueueListeners.push(listener)
          return
        }

        dequeueListeners.push(listener)
      },
    }
  },
}))

vi.mock('../composables', () => ({
  useAnalytics: () => ({
    trackFirstMessage: trackFirstMessageMock,
  }),
}))

vi.mock('../services/memory/gateway', () => ({
  createMemoryGateway: createMemoryGatewayMock,
}))

vi.mock('../composables/llm-marker-parser', () => ({
  useLlmmarkerParser: (options: { onLiteral?: (literal: string) => Promise<void>, onEnd?: (fullText: string) => Promise<void> }) => {
    let fullText = ''
    return {
      consume: async (textPart: string) => {
        parserConsumeMock(textPart)
        fullText += textPart
        await options.onLiteral?.(textPart)
      },
      end: async () => {
        parserEndMock()
        await options.onEnd?.(fullText)
      },
    }
  },
}))

vi.mock('../composables/response-categoriser', () => ({
  createStreamingCategorizer: () => ({
    consume: vi.fn(),
    filterToSpeech: (literal: string) => literal,
  }),
  categorizeResponse: (fullText: string) => ({
    speech: fullText,
    reasoning: '',
  }),
}))

vi.mock('./chat/context-providers', () => ({
  createMinecraftContext: () => createMinecraftContextMock(),
}))

vi.mock('./chat/context-store', () => ({
  useChatContextStore: () => ({
    ingestContextMessage: ingestContextMessageMock,
    getContextsSnapshot: getContextsSnapshotMock,
  }),
}))

vi.mock('./chat/session-store', () => ({
  useChatSessionStore: () => ({
    activeSessionId: activeSessionIdRef,
    sessionMessages,
    ensureSession: (sessionId: string) => {
      ensureSessionMock(sessionId)
      sessionMessages[sessionId] ??= [{ role: 'system', content: 'system prompt', createdAt: 1, id: 'system' }]
    },
    appendSessionMessage: (sessionId: string, message: any) => {
      sessionMessages[sessionId] ??= []
      sessionMessages[sessionId].push(message)
    },
    getSessionMessages: (sessionId: string) => sessionMessages[sessionId] ?? [],
    persistSessionMessages: persistSessionMessagesMock,
    getSessionGeneration: () => currentGeneration,
    forkSession: forkSessionMock,
  }),
}))

vi.mock('./chat/hooks', () => ({
  createChatHooks: () => {
    const beforeMessageComposed: Array<(message: string, context: any) => Promise<void> | void> = []
    const afterMessageComposed: Array<(message: string, context: any) => Promise<void> | void> = []
    const beforeSend: Array<(message: string, context: any) => Promise<void> | void> = []
    const afterSend: Array<(message: string, context: any) => Promise<void> | void> = []
    const tokenLiteral: Array<(literal: string, context: any) => Promise<void> | void> = []
    const tokenSpecial: Array<(special: string, context: any) => Promise<void> | void> = []
    const streamEnd: Array<(context: any) => Promise<void> | void> = []
    const assistantResponseEnd: Array<(fullText: string, context: any) => Promise<void> | void> = []
    const assistantMessage: Array<(message: any, fullText: string, context: any) => Promise<void> | void> = []
    const chatTurnComplete: Array<(turn: any, context: any) => Promise<void> | void> = []

    return {
      clearHooks: vi.fn(),
      emitBeforeMessageComposedHooks: async (message: string, context: any) => { for (const hook of beforeMessageComposed) await hook(message, context) },
      emitAfterMessageComposedHooks: async (message: string, context: any) => { for (const hook of afterMessageComposed) await hook(message, context) },
      emitBeforeSendHooks: async (message: string, context: any) => { for (const hook of beforeSend) await hook(message, context) },
      emitAfterSendHooks: async (message: string, context: any) => { for (const hook of afterSend) await hook(message, context) },
      emitTokenLiteralHooks: async (literal: string, context: any) => { for (const hook of tokenLiteral) await hook(literal, context) },
      emitTokenSpecialHooks: async (special: string, context: any) => { for (const hook of tokenSpecial) await hook(special, context) },
      emitStreamEndHooks: async (context: any) => { for (const hook of streamEnd) await hook(context) },
      emitAssistantResponseEndHooks: async (fullText: string, context: any) => { for (const hook of assistantResponseEnd) await hook(fullText, context) },
      emitAssistantMessageHooks: async (message: any, fullText: string, context: any) => { for (const hook of assistantMessage) await hook(message, fullText, context) },
      emitChatTurnCompleteHooks: async (turn: any, context: any) => { for (const hook of chatTurnComplete) await hook(turn, context) },
      onBeforeMessageComposed: (hook: any) => beforeMessageComposed.push(hook),
      onAfterMessageComposed: (hook: any) => afterMessageComposed.push(hook),
      onBeforeSend: (hook: any) => beforeSend.push(hook),
      onAfterSend: (hook: any) => afterSend.push(hook),
      onTokenLiteral: (hook: any) => tokenLiteral.push(hook),
      onTokenSpecial: (hook: any) => tokenSpecial.push(hook),
      onStreamEnd: (hook: any) => streamEnd.push(hook),
      onAssistantResponseEnd: (hook: any) => assistantResponseEnd.push(hook),
      onAssistantMessage: (hook: any) => assistantMessage.push(hook),
      onChatTurnComplete: (hook: any) => chatTurnComplete.push(hook),
    }
  },
}))

vi.mock('./chat/stream-store', () => ({
  useChatStreamStore: () => ({
    streamingMessage: streamingMessageRef,
  }),
}))

vi.mock('./modules/airi-card', () => ({
  useAiriCardStore: () => ({
    activeCard: undefined,
    activeCardId: ref('character-1'),
  }),
}))

vi.mock('./modules/artistry-autonomous', () => ({
  useAutonomousArtistryStore: () => ({
    runArtistTask: vi.fn(),
  }),
}))

vi.mock('./auth', () => ({
  useAuthStore: () => ({
    userId: ref('user-1'),
  }),
}))

vi.mock('./llm', () => ({
  useLLM: () => ({
    stream: llmStreamMock,
  }),
}))

vi.mock('./modules/consciousness', () => ({
  useConsciousnessStore: () => ({
    activeProvider: ref('mock-provider'),
  }),
}))

const provider = {
  chat: () => ({ baseURL: 'https://example.com/' }),
} as unknown as ChatProvider

function createTempDatabasePath() {
  const directoryPath = mkdtempSync(join(tmpdir(), 'airi-chat-memory-integration-'))

  return {
    cleanup: () => rmSync(directoryPath, { force: true, recursive: true }),
    databasePath: join(directoryPath, 'memory.sqlite'),
  }
}

function createIntegrationGateway(repository: ReturnType<typeof createMemoryRepository>, runtime: ReturnType<typeof setupMemorySyncRuntime>): MemoryGateway {
  return {
    async appendTurn(input) {
      const record = repository.appendTurn(input)
      return {
        schemaVersion: 1,
        storedTurnId: record.turnId,
        syncCheckpoint: 0,
      }
    },
    async getSyncState(input) {
      const syncState = repository.getSyncState(input)
      const runtimeStatus = runtime.getStatus()

      return {
        runtimeMode: 'desktop-local-sqlite' as const,
        schemaVersion: 1,
        scope: input.scope,
        syncMode: runtimeStatus.uploader.mode === 'disabled' && runtimeStatus.patch.mode === 'disabled'
          ? 'disabled'
          : 'enabled',
        syncModeReason: runtimeStatus.uploader.mode === 'disabled' && runtimeStatus.patch.mode === 'disabled'
          ? runtimeStatus.uploader.reason ?? runtimeStatus.patch.reason ?? null
          : null,
        syncState: syncState
          ? {
              lastAppliedSummaryVersion: syncState.lastAppliedSummaryVersion,
              lastError: syncState.lastError ?? null,
              lastLocalTurnCheckpoint: syncState.lastLocalTurnCheckpoint,
              lastPullAt: syncState.lastPullAt ?? null,
              lastSyncedAt: syncState.lastSyncedAt ?? null,
              lastUploadAt: syncState.lastUploadAt ?? null,
              pendingTurnCount: syncState.pendingTurnCount,
              remoteCheckpoint: syncState.remoteCheckpoint ?? null,
              state: syncState.state as 'idle' | 'syncing' | 'error',
              syncCheckpoint: syncState.syncCheckpoint,
            }
          : null,
      }
    },
    async readPromptContext(input) {
      const promptContext = repository.readPromptContext(input)
      return {
        memoryCards: [],
        profileSummary: promptContext.profileSummary?.summaryMarkdown ?? null,
        recentTurns: promptContext.recentTurns.map(turn => ({
          createdAt: turn.createdAt,
          role: turn.role,
          text: turn.text,
          turnId: turn.turnId,
        })),
        schemaVersion: 1,
        scope: input.scope,
        stableFacts: promptContext.stableFacts.map(fact => ({
          confidence: fact.confidence,
          id: fact.id,
          key: fact.factKey,
          value: fact.factValue,
        })),
      }
    },
  }
}

describe('chat memory integration', () => {
  const cleanupCallbacks: Array<() => void> = []

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    activeSessionIdRef.value = 'session-1'
    streamingMessageRef.value = { role: 'assistant', content: '', slices: [], tool_results: [] }
    currentGeneration = 1

    for (const key of Object.keys(sessionMessages)) {
      delete sessionMessages[key]
    }

    sessionMessages['session-1'] = [{ role: 'system', content: 'system prompt', createdAt: 1, id: 'system' }]
    getContextsSnapshotMock.mockReturnValue({})
    createMinecraftContextMock.mockReturnValue(undefined)
  })

  afterEach(() => {
    for (const cleanup of cleanupCallbacks.splice(0)) {
      cleanup()
    }
  })

  it('writes user and assistant turns locally, reads local memory into the prompt, and reflects merged sync status', async () => {
    const tempDatabase = createTempDatabasePath()
    cleanupCallbacks.push(tempDatabase.cleanup)

    const repository = createMemoryRepository({ databasePath: tempDatabase.databasePath })
    repository.initialize()
    repository.appendTurn({
      createdAt: 1_000,
      rawPayload: { content: 'earlier user' },
      role: 'user',
      scope: {
        characterId: 'character-1',
        sessionId: 'session-1',
        userId: 'user-1',
      },
      text: 'earlier user',
      turnId: 'turn-earlier-user',
    })
    repository.appendTurn({
      createdAt: 2_000,
      rawPayload: { content: 'earlier assistant' },
      role: 'assistant',
      scope: {
        characterId: 'character-1',
        sessionId: 'session-1',
        userId: 'user-1',
      },
      text: 'earlier assistant',
      turnId: 'turn-earlier-assistant',
    })
    repository.markRawTurnsUploaded({
      scope: {
        characterId: 'character-1',
        sessionId: 'session-1',
        userId: 'user-1',
      },
      turnIds: ['turn-earlier-user', 'turn-earlier-assistant'],
      uploadedAt: 3_000,
    })
    repository.applyMemoryPatch({
      nextPullAt: 9_000,
      patch: {
        factsPatch: [
          {
            confidence: 0.9,
            factKey: 'preference',
            factValue: 'concise',
            generatedFromTurnId: 'turn-earlier-assistant',
          },
        ],
        scope: {
          characterId: 'character-1',
          sessionId: 'session-1',
          userId: 'user-1',
        },
        summaryPatch: {
          confidence: 0.8,
          generatedFromTurnId: 'turn-earlier-assistant',
          summaryMarkdown: 'Existing summary',
          summaryVersion: 2,
        },
      },
      pulledAt: 4_000,
    })

    const currentTime = 10_000
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes('/raw-turns')) {
        return {
          ok: true,
          status: 200,
        }
      }

      return {
        json: async () => ({
          factsPatch: [
            {
              confidence: 1,
              factKey: 'location',
              factValue: 'kyoto',
              generatedFromTurnId: 'assistant-current',
            },
          ],
          scope: {
            characterId: 'character-1',
            sessionId: 'session-1',
            userId: 'user-1',
          },
          summaryPatch: {
            confidence: 0.95,
            generatedFromTurnId: 'assistant-current',
            summaryMarkdown: 'Merged summary',
            summaryVersion: 3,
          },
        }),
        ok: true,
        status: 200,
      }
    })
    const runtime = setupMemorySyncRuntime({
      config: {
        patch: {
          authToken: 'token',
          enabled: true,
          endpointUrl: 'https://example.com/memory/patch',
          pullIntervalMs: 15_000,
          requestTimeoutMs: 10_000,
          retryDelayMs: 30_000,
        },
        turnCountThreshold: 2,
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

    const gateway = createIntegrationGateway(repository, runtime)

    createMemoryGatewayMock.mockReturnValue(gateway)

    let composedMessages: Message[] = []
    llmStreamMock.mockImplementation(async (_model: string, _chatProvider: ChatProvider, messages: Message[], options: any) => {
      composedMessages = messages
      await options.onStreamEvent({ type: 'text-delta', text: 'assistant final' })
      await options.onStreamEvent({ type: 'finish', finishReason: 'stop' })
    })

    const store = useChatOrchestratorStore()

    await store.ingest('current user', {
      chatProvider: provider,
      model: 'gpt-test',
    })

    expect(repository.listPendingRawTurns({
      scope: {
        characterId: 'character-1',
        sessionId: 'session-1',
        userId: 'user-1',
      },
    }).map(turn => `${turn.role}:${turn.text}`)).toEqual([
      'user:current user',
      'assistant:assistant final',
    ])

    const userMessageContent = (composedMessages[1] as any).content
    const memoryTextPart = Array.isArray(userMessageContent) ? userMessageContent.find((part: any) => String(part.text).includes('[Memory]'))?.text : userMessageContent

    expect(memoryTextPart).toContain('Existing summary')
    expect(memoryTextPart).toContain('- preference: concise')
    expect(memoryTextPart).toContain('- user: earlier user')
    expect(memoryTextPart).toContain('- assistant: earlier assistant')
    expect(memoryTextPart).not.toContain('current user')
    expect(memoryTextPart).not.toContain('card')

    await runtime.tick()

    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(repository.readPromptContext({
      scope: {
        characterId: 'character-1',
        sessionId: 'session-1',
        userId: 'user-1',
      },
    })).toEqual(expect.objectContaining({
      profileSummary: expect.objectContaining({
        summaryMarkdown: 'Merged summary',
        version: 3,
      }),
      stableFacts: expect.arrayContaining([
        expect.objectContaining({
          factKey: 'location',
          factValue: 'kyoto',
        }),
      ]),
    }))

    await expect(readMemoryStatusSnapshot({
      gateway,
      runtime: 'desktop',
      scope: {
        characterId: 'character-1',
        sessionId: 'session-1',
        userId: 'user-1',
      },
    })).resolves.toEqual(expect.objectContaining({
      lastAppliedSummaryVersion: 3,
      pendingTurnCount: 0,
      runtimeMode: 'desktop-local-sqlite',
      syncMode: 'enabled',
    }))

    repository.close()
  })

  it('reads memory before appending the current turn, while the next turn can recall the previous turn pair', async () => {
    const tempDatabase = createTempDatabasePath()
    cleanupCallbacks.push(tempDatabase.cleanup)

    const repository = createMemoryRepository({ databasePath: tempDatabase.databasePath })
    repository.initialize()
    const runtime = setupMemorySyncRuntime({
      repository,
    })
    const gateway = createIntegrationGateway(repository, runtime)

    createMemoryGatewayMock.mockReturnValue(gateway)

    const composedMessagesByTurn: Message[][] = []
    llmStreamMock.mockImplementation(async (_model: string, _chatProvider: ChatProvider, messages: Message[], options: any) => {
      composedMessagesByTurn.push(messages)
      const responseText = composedMessagesByTurn.length === 1 ? 'first assistant memory' : 'second assistant memory'
      await options.onStreamEvent({ type: 'text-delta', text: responseText })
      await options.onStreamEvent({ type: 'finish', finishReason: 'stop' })
    })

    const store = useChatOrchestratorStore()

    await store.ingest('first user memory', {
      chatProvider: provider,
      model: 'gpt-test',
    })
    await store.ingest('second user memory', {
      chatProvider: provider,
      model: 'gpt-test',
    })

    expect(composedMessagesByTurn).toHaveLength(2)

    const firstComposedMessages = composedMessagesByTurn[0]!
    const secondComposedMessages = composedMessagesByTurn[1]!
    const firstUserMessageContent = (firstComposedMessages[1] as any).content
    const firstMemoryTextPart = Array.isArray(firstUserMessageContent)
      ? firstUserMessageContent.find((part: any) => String(part.text).includes('[Memory]'))?.text
      : undefined
    const secondUserMessageContent = (secondComposedMessages.at(-1) as any).content
    const secondMemoryTextPart = Array.isArray(secondUserMessageContent)
      ? secondUserMessageContent.find((part: any) => String(part.text).includes('[Memory]'))?.text
      : secondUserMessageContent

    expect(firstMemoryTextPart).toBeUndefined()
    expect(secondMemoryTextPart).toContain('- user: first user memory')
    expect(secondMemoryTextPart).toContain('- assistant: first assistant memory')
    expect(secondMemoryTextPart).not.toContain('second user memory')

    repository.close()
  })

  it('does not pollute local state when the same patch is applied twice through runtime pull', async () => {
    const tempDatabase = createTempDatabasePath()
    cleanupCallbacks.push(tempDatabase.cleanup)

    const repository = createMemoryRepository({ databasePath: tempDatabase.databasePath })
    repository.initialize()

    repository.appendTurn({
      createdAt: 1_000,
      rawPayload: { content: 'seed' },
      role: 'assistant',
      scope: {
        characterId: 'character-1',
        sessionId: 'session-1',
        userId: 'user-1',
      },
      text: 'seed',
      turnId: 'turn-seed',
    })
    repository.markRawTurnsUploaded({
      scope: {
        characterId: 'character-1',
        sessionId: 'session-1',
        userId: 'user-1',
      },
      turnIds: ['turn-seed'],
      uploadedAt: 2_000,
    })

    let currentTime = 10_000
    const fetchImpl = vi.fn(async () => ({
      json: async () => ({
        factsPatch: [
          {
            confidence: 1,
            factKey: 'location',
            factValue: 'kyoto',
            generatedFromTurnId: 'turn-seed',
          },
        ],
        scope: {
          characterId: 'character-1',
          sessionId: 'session-1',
          userId: 'user-1',
        },
        summaryPatch: {
          confidence: 1,
          generatedFromTurnId: 'turn-seed',
          summaryMarkdown: 'Merged summary',
          summaryVersion: 2,
        },
      }),
      ok: true,
      status: 200,
    }))
    const runtime = setupMemorySyncRuntime({
      config: {
        patch: {
          authToken: 'token',
          enabled: true,
          endpointUrl: 'https://example.com/memory/patch',
          pullIntervalMs: 5_000,
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

    const database = new DatabaseSync(tempDatabase.databasePath)
    const firstSummaryCount = (database.prepare(`SELECT COUNT(*) AS count FROM profile_summary`).get() as { count: number }).count
    const firstFactCount = (database.prepare(`SELECT COUNT(*) AS count FROM stable_facts`).get() as { count: number }).count

    currentTime = 20_000
    await runtime.tick()

    const secondSummaryCount = (database.prepare(`SELECT COUNT(*) AS count FROM profile_summary`).get() as { count: number }).count
    const secondFactCount = (database.prepare(`SELECT COUNT(*) AS count FROM stable_facts`).get() as { count: number }).count

    expect(secondSummaryCount).toBe(firstSummaryCount)
    expect(secondFactCount).toBe(firstFactCount)
    expect(repository.getSyncState({
      scope: {
        characterId: 'character-1',
        sessionId: 'session-1',
        userId: 'user-1',
      },
    })).toEqual(expect.objectContaining({
      lastAppliedSummaryVersion: 2,
    }))

    database.close()
    repository.close()
  })
})
