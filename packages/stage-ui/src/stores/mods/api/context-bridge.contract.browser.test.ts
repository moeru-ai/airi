import type { ChatStreamEvent, ChatStreamEventContext, ContextMessage } from '../../../types/chat'

import { ContextUpdateStrategy } from '@proj-airi/server-sdk'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

import { CHAT_STREAM_CHANNEL_NAME, CONTEXT_CHANNEL_NAME } from '../../chat/constants'
import { createContextChannel } from './context-channel'

type HookCallback = (...args: unknown[]) => Promise<void> | void
type UseContextBridgeStore = typeof import('./context-bridge')['useContextBridgeStore']

const contextUpdateHooks: HookCallback[] = []
const serverEventHooks = new Map<string, HookCallback[]>()

const chatContextIngestMock = vi.fn()
const beginStreamMock = vi.fn()
const appendStreamLiteralMock = vi.fn()
const finalizeStreamMock = vi.fn()
const resetStreamMock = vi.fn()
const refreshSessionMock = vi.fn()
const serverSendMock = vi.fn()
const ensureConnectedMock = vi.fn().mockResolvedValue(undefined)
const onReconnectedMock = vi.fn(() => () => {})
const onContextUpdateMock = vi.fn((callback: HookCallback) => registerHook(contextUpdateHooks, callback))
const onEventMock = vi.fn((eventName: string, callback: HookCallback) => registerServerEventHook(eventName, callback))
const getProviderInstanceMock = vi.fn()
const recordLifecycleMock = vi.fn()

const activeProviderRef = ref<string | null>(null)
const activeModelRef = ref<string | null>(null)

const beforeComposeHooks: HookCallback[] = []
const afterComposeHooks: HookCallback[] = []
const beforeSendHooks: HookCallback[] = []
const afterSendHooks: HookCallback[] = []
const tokenLiteralHooks: HookCallback[] = []
const tokenSpecialHooks: HookCallback[] = []
const streamEndHooks: HookCallback[] = []
const assistantEndHooks: HookCallback[] = []
const assistantMessageHooks: HookCallback[] = []
const turnCompleteHooks: HookCallback[] = []

const activeSessionIdRef = ref('session-1')
let currentGeneration = 7
const testChannels: Array<ReturnType<typeof createContextChannel>> = []
let useContextBridgeStore: UseContextBridgeStore

function registerHook(target: HookCallback[], callback: HookCallback) {
  target.push(callback)
  return () => {
    const index = target.indexOf(callback)
    if (index >= 0)
      target.splice(index, 1)
  }
}

function registerServerEventHook(eventName: string, callback: HookCallback) {
  const hooks = serverEventHooks.get(eventName) ?? []
  serverEventHooks.set(eventName, hooks)
  return registerHook(hooks, callback)
}

function createTestChannel(name: string) {
  const channel = createContextChannel()
  testChannels.push(channel)
  return {
    postMessage(message: ContextMessage | ChatStreamEvent) {
      return name === CONTEXT_CHANNEL_NAME
        ? channel.emitContext(message as ContextMessage)
        : channel.emitStream(message as ChatStreamEvent)
    },
  }
}

function collectChannelMessages<T>(name: string) {
  const messages: T[] = []
  const channel = createContextChannel()
  testChannels.push(channel)
  if (name === CONTEXT_CHANNEL_NAME) {
    channel.onContext((message) => {
      messages.push(message as T)
    })
  }
  else {
    channel.onStream((message) => {
      messages.push(message as T)
    })
  }
  return messages
}

function closeTestChannels() {
  for (const channel of testChannels) {
    channel.dispose(new Error('Context bridge contract test ended'))
  }
  testChannels.length = 0
}

async function waitForBroadcastDelivery() {
  await new Promise(resolve => setTimeout(resolve, 50))
}

async function emitHooks(target: HookCallback[], ...args: unknown[]) {
  for (const callback of target) {
    await callback(...args)
  }
}

async function emitContextUpdate(event: unknown) {
  await emitHooks(contextUpdateHooks, event)
}

async function emitServerEvent(eventName: string, event: unknown) {
  await emitHooks(serverEventHooks.get(eventName) ?? [], event)
}

function createMetadata(extensionId: string, moduleId: string) {
  return {
    source: {
      id: moduleId,
      extension: {
        id: extensionId,
      },
    },
  }
}

function createContextMessage(overrides: Record<string, unknown> = {}) {
  const id = typeof overrides.id === 'string' ? overrides.id : 'context-1'

  return {
    id,
    contextId: typeof overrides.contextId === 'string' ? overrides.contextId : id,
    strategy: ContextUpdateStrategy.AppendSelf,
    text: 'context text',
    createdAt: 1,
    ...overrides,
  }
}

function createContextUpdateEvent(overrides: Record<string, unknown> = {}) {
  const id = typeof overrides.id === 'string' ? overrides.id : 'context-1'

  return {
    type: 'context:update',
    source: 'extension-module-host',
    metadata: createMetadata('weather', 'station-1'),
    data: {
      id,
      contextId: id,
      strategy: ContextUpdateStrategy.AppendSelf,
      text: 'weather changed',
      ...overrides,
    },
  }
}

const chatOrchestratorMock = {
  activeSendSessionId: undefined as string | undefined,
  sending: false,
  ingest: vi.fn(),

  onBeforeMessageComposed: (callback: HookCallback) => registerHook(beforeComposeHooks, callback),
  onAfterMessageComposed: (callback: HookCallback) => registerHook(afterComposeHooks, callback),
  onBeforeSend: (callback: HookCallback) => registerHook(beforeSendHooks, callback),
  onAfterSend: (callback: HookCallback) => registerHook(afterSendHooks, callback),
  onTokenLiteral: (callback: HookCallback) => registerHook(tokenLiteralHooks, callback),
  onTokenSpecial: (callback: HookCallback) => registerHook(tokenSpecialHooks, callback),
  onStreamEnd: (callback: HookCallback) => registerHook(streamEndHooks, callback),
  onAssistantResponseEnd: (callback: HookCallback) => registerHook(assistantEndHooks, callback),
  onAssistantMessage: (callback: HookCallback) => registerHook(assistantMessageHooks, callback),
  onChatTurnComplete: (callback: HookCallback) => registerHook(turnCompleteHooks, callback),

  emitBeforeMessageComposedHooks: (...args: unknown[]) => emitHooks(beforeComposeHooks, ...args),
  emitAfterMessageComposedHooks: (...args: unknown[]) => emitHooks(afterComposeHooks, ...args),
  emitBeforeSendHooks: (...args: unknown[]) => emitHooks(beforeSendHooks, ...args),
  emitAfterSendHooks: (...args: unknown[]) => emitHooks(afterSendHooks, ...args),
  emitTokenLiteralHooks: (...args: unknown[]) => emitHooks(tokenLiteralHooks, ...args),
  emitTokenSpecialHooks: (...args: unknown[]) => emitHooks(tokenSpecialHooks, ...args),
  emitStreamEndHooks: (...args: unknown[]) => emitHooks(streamEndHooks, ...args),
  emitAssistantResponseEndHooks: (...args: unknown[]) => emitHooks(assistantEndHooks, ...args),
}

vi.mock('pinia', async () => {
  const actual = await vi.importActual<typeof import('pinia')>('pinia')
  return {
    ...actual,
    storeToRefs: (store: unknown) => store,
  }
})

vi.mock('@proj-airi/stage-shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@proj-airi/stage-shared')>()
  return {
    ...actual,
    isStageWeb: () => true,
    isStageTamagotchi: () => false,
  }
})

vi.mock('es-toolkit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('es-toolkit')>()
  return {
    ...actual,
    Mutex: class {
      async acquire() {}
      release() {}
    },
  }
})

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}))

vi.mock('../../character', () => ({
  useCharacterOrchestratorStore: () => ({
    handleSparkNotifyWithReaction: vi.fn(async (_event: unknown, options: { fallbackText: string }) => options.fallbackText),
  }),
}))

vi.mock('../../chat', () => ({
  useChatStore: () => chatOrchestratorMock,
}))

vi.mock('../../chat/context-store', () => ({
  useChatContextStore: () => ({
    ingestContextMessage: chatContextIngestMock,
  }),
}))

vi.mock('../../chat/session-store', () => ({
  useChatSessionStore: () => ({
    get activeSessionId() {
      return activeSessionIdRef.value
    },
    getSessionGenerationValue: () => currentGeneration,
    refreshSession: (sessionId: string) => refreshSessionMock(sessionId),
  }),
}))

vi.mock('../../chat/stream-store', () => ({
  useChatStreamStore: () => ({
    beginStream: beginStreamMock,
    appendStreamLiteral: appendStreamLiteralMock,
    finalizeStream: finalizeStreamMock,
    resetStream: resetStreamMock,
  }),
}))

vi.mock('../../devtools/context-observability', () => ({
  useContextObservabilityStore: () => ({
    recordLifecycle: recordLifecycleMock,
  }),
}))

vi.mock('../../modules/consciousness', () => ({
  useConsciousnessStore: () => ({
    activeProvider: activeProviderRef,
    activeModel: activeModelRef,
    getChatProviderInstance: getProviderInstanceMock,
  }),
}))

vi.mock('../../providers/provider', () => ({
  useProviderStore: () => ({
    configuredSpeechProvidersMetadata: [],
    getProviderConfig: vi.fn(() => ({})),
    getProviderInstance: getProviderInstanceMock,
    providerRuntimeState: {},
  }),
}))

vi.mock('./channel-server', () => ({
  useModsServerChannelStore: () => ({
    ensureConnected: ensureConnectedMock,
    onReconnected: onReconnectedMock,
    onContextUpdate: onContextUpdateMock,
    onEvent: onEventMock,
    send: serverSendMock,
  }),
}))

describe('context bridge contract', () => {
  beforeEach(async () => {
    setActivePinia(createPinia())
    ;({ useContextBridgeStore } = await import('./context-bridge'))

    chatContextIngestMock.mockReset()
    beginStreamMock.mockReset()
    appendStreamLiteralMock.mockReset()
    finalizeStreamMock.mockReset()
    resetStreamMock.mockReset()
    refreshSessionMock.mockReset().mockResolvedValue(true)
    serverSendMock.mockReset()
    ensureConnectedMock.mockClear()
    ensureConnectedMock.mockResolvedValue(undefined)
    onReconnectedMock.mockClear()
    onContextUpdateMock.mockClear()
    onEventMock.mockClear()
    getProviderInstanceMock.mockReset()
    recordLifecycleMock.mockReset()
    chatOrchestratorMock.ingest.mockReset()

    activeProviderRef.value = null
    activeModelRef.value = null
    activeSessionIdRef.value = 'session-1'
    chatOrchestratorMock.activeSendSessionId = undefined
    currentGeneration = 7
    chatOrchestratorMock.sending = false

    beforeComposeHooks.length = 0
    afterComposeHooks.length = 0
    beforeSendHooks.length = 0
    afterSendHooks.length = 0
    tokenLiteralHooks.length = 0
    tokenSpecialHooks.length = 0
    streamEndHooks.length = 0
    assistantEndHooks.length = 0
    assistantMessageHooks.length = 0
    turnCompleteHooks.length = 0
    contextUpdateHooks.length = 0
    serverEventHooks.clear()
  })

  afterEach(() => {
    closeTestChannels()
  })

  it('records core ingest result for broadcast context updates', async () => {
    chatContextIngestMock.mockReturnValueOnce({
      sourceKey: 'weather:station-1',
      mutation: 'append',
      entryCount: 2,
    })
    const store = useContextBridgeStore()
    await store.initialize()
    const contextSender = createTestChannel(CONTEXT_CHANNEL_NAME)

    contextSender.postMessage(createContextMessage({
      id: 'broadcast-context',
      metadata: createMetadata('weather', 'station-1'),
      text: 'broadcast weather',
    }))

    await vi.waitFor(() => {
      expect(chatContextIngestMock).toHaveBeenCalledTimes(1)
    })
    expect(recordLifecycleMock).toHaveBeenCalledWith(expect.objectContaining({
      phase: 'store-ingested',
      channel: 'broadcast',
      sourceKey: 'weather:station-1',
      mutation: 'append',
      details: expect.objectContaining({
        entryCount: 2,
      }),
    }))

    await store.dispose()
  })

  it('records core ingest result for server context updates before broadcasting', async () => {
    chatContextIngestMock.mockReturnValueOnce({
      sourceKey: 'weather:station-1',
      mutation: 'replace',
      entryCount: 1,
    })
    const store = useContextBridgeStore()
    await store.initialize()

    await emitContextUpdate(createContextUpdateEvent({
      id: 'server-context',
      strategy: ContextUpdateStrategy.ReplaceSelf,
      text: 'server weather',
    }))

    expect(chatContextIngestMock).toHaveBeenCalledTimes(1)
    expect(recordLifecycleMock).toHaveBeenCalledWith(expect.objectContaining({
      phase: 'store-ingested',
      channel: 'server',
      sourceKey: 'weather:station-1',
      mutation: 'replace',
      details: expect.objectContaining({
        entryCount: 1,
      }),
    }))
    expect(recordLifecycleMock).toHaveBeenCalledWith(expect.objectContaining({
      phase: 'broadcast-posted',
      channel: 'broadcast',
      contextId: 'server-context',
    }))

    await store.dispose()
  })

  it('records core ingest result for input context updates and forwards accepted updates', async () => {
    chatContextIngestMock.mockReturnValueOnce({
      sourceKey: 'weather:station-1',
      mutation: 'append',
      entryCount: 1,
    })
    activeProviderRef.value = 'mock-provider'
    activeModelRef.value = 'mock-model'
    getProviderInstanceMock.mockResolvedValueOnce({})
    const store = useContextBridgeStore()
    await store.initialize()

    await emitServerEvent('input:text', {
      type: 'input:text',
      source: 'extension-module-host',
      metadata: createMetadata('weather', 'station-1'),
      data: {
        text: 'hello',
        contextUpdates: [
          {
            strategy: ContextUpdateStrategy.AppendSelf,
            text: 'input weather',
          },
        ],
      },
    })

    expect(chatContextIngestMock).toHaveBeenCalledTimes(1)
    expect(recordLifecycleMock).toHaveBeenCalledWith(expect.objectContaining({
      phase: 'store-ingested',
      channel: 'input',
      sourceKey: 'weather:station-1',
      mutation: 'append',
      details: expect.objectContaining({
        entryCount: 1,
        inputType: 'input:text',
      }),
    }))
    expect(chatOrchestratorMock.ingest).toHaveBeenCalledTimes(1)
    expect(chatOrchestratorMock.ingest.mock.calls[0]?.[1]?.input?.data.contextUpdates).toEqual([
      expect.objectContaining({
        contextId: expect.any(String),
        id: expect.any(String),
        text: 'input weather',
      }),
    ])

    await store.dispose()
  })

  it('records rejected lifecycle for broadcast ingest failures without interrupting the watcher', async () => {
    chatContextIngestMock.mockImplementationOnce(() => {
      throw new Error('Cannot clone broadcast context')
    })
    const store = useContextBridgeStore()
    await store.initialize()
    const contextSender = createTestChannel(CONTEXT_CHANNEL_NAME)

    contextSender.postMessage(createContextMessage({
      id: 'bad-broadcast-context',
      metadata: createMetadata('weather', 'station-1'),
      text: 'bad broadcast weather',
    }))

    await vi.waitFor(() => {
      expect(recordLifecycleMock).toHaveBeenCalledWith(expect.objectContaining({
        phase: 'store-ingest-rejected',
        channel: 'broadcast',
        contextId: 'bad-broadcast-context',
        details: expect.objectContaining({
          errorMessage: 'Cannot clone broadcast context',
        }),
      }))
    })

    await store.dispose()
  })

  it('records rejected lifecycle and skips broadcast when server context ingest fails', async () => {
    chatContextIngestMock.mockImplementationOnce(() => {
      throw new Error('Cannot clone server context')
    })
    const postedContexts = collectChannelMessages(CONTEXT_CHANNEL_NAME)
    const store = useContextBridgeStore()
    await store.initialize()

    await emitContextUpdate(createContextUpdateEvent({
      id: 'bad-server-context',
      text: 'bad server weather',
    }))
    await waitForBroadcastDelivery()

    expect(recordLifecycleMock).toHaveBeenCalledWith(expect.objectContaining({
      phase: 'store-ingest-rejected',
      channel: 'server',
      contextId: 'bad-server-context',
      details: expect.objectContaining({
        errorMessage: 'Cannot clone server context',
      }),
    }))
    expect(recordLifecycleMock).not.toHaveBeenCalledWith(expect.objectContaining({
      phase: 'broadcast-posted',
      contextId: 'bad-server-context',
    }))
    expect(postedContexts).toHaveLength(0)

    await store.dispose()
  })

  it('records rejected lifecycle and continues text ingestion when input context ingest fails', async () => {
    chatContextIngestMock.mockImplementationOnce(() => {
      throw new Error('Cannot clone input context')
    })
    activeProviderRef.value = 'mock-provider'
    activeModelRef.value = 'mock-model'
    getProviderInstanceMock.mockResolvedValueOnce({})
    const store = useContextBridgeStore()
    await store.initialize()

    await emitServerEvent('input:text', {
      type: 'input:text',
      source: 'extension-module-host',
      metadata: createMetadata('weather', 'station-1'),
      data: {
        text: 'hello',
        contextUpdates: [
          {
            strategy: ContextUpdateStrategy.AppendSelf,
            text: 'bad input weather',
          },
        ],
      },
    })

    expect(recordLifecycleMock).toHaveBeenCalledWith(expect.objectContaining({
      phase: 'store-ingest-rejected',
      channel: 'input',
      details: expect.objectContaining({
        errorMessage: 'Cannot clone input context',
      }),
    }))
    expect(chatOrchestratorMock.ingest).toHaveBeenCalledTimes(1)
    expect(chatOrchestratorMock.ingest.mock.calls[0]?.[1]?.input?.data.contextUpdates).toEqual([])

    await store.dispose()
  })

  // https://github.com/moeru-ai/airi/pull/2086#discussion_r3743366445
  it('keeps a remote stream visible locally without publishing chat authority state for Issue #2085', async () => {
    // ROOT CAUSE:
    //
    // Stage Pocket uses plain Pinia, so remote stream tokens update only the
    // local stream store. The history requires a sending flag, but writing
    // that flag to the synchronized chat store would let a follower overwrite
    // the elected authority's stream snapshot.
    const store = useContextBridgeStore()
    await store.initialize()
    const streamSender = createTestChannel(CHAT_STREAM_CHANNEL_NAME)

    const context = {
      turnId: 'turn-1',
      message: { role: 'user', content: 'ping' },
      contexts: {},
      composedMessage: [],
    } satisfies ChatStreamEventContext

    streamSender.postMessage({ type: 'before-send', message: 'ping', sessionId: 'session-1', context })
    await vi.waitFor(() => {
      expect(beginStreamMock).toHaveBeenCalledWith('turn-1')
    })
    expect(chatOrchestratorMock.sending).toBe(false)
    expect(store.isReceivingRemoteStream).toBe(true)

    streamSender.postMessage({ type: 'token-literal', literal: 'hello', sessionId: 'session-1', context })
    await vi.waitFor(() => {
      expect(appendStreamLiteralMock).toHaveBeenCalledWith('hello')
    })

    streamSender.postMessage({ type: 'assistant-end', message: 'final answer', sessionId: 'session-1', context })
    await vi.waitFor(() => {
      expect(resetStreamMock).toHaveBeenCalledTimes(1)
    })

    // The bridge should call resetStream on follower tabs, not finalizeStream,
    // to avoid corrupting history by persisting a duplicate assistant message.
    expect(finalizeStreamMock).not.toHaveBeenCalled()
    expect(chatOrchestratorMock.sending).toBe(false)
    expect(store.isReceivingRemoteStream).toBe(false)

    await store.dispose()
  })

  it('suppresses outbound broadcast while processing remote stream events', async () => {
    const outgoingStreamMessages = collectChannelMessages<{ sessionId: string }>(CHAT_STREAM_CHANNEL_NAME)
    const store = useContextBridgeStore()
    await store.initialize()
    const streamSender = createTestChannel(CHAT_STREAM_CHANNEL_NAME)

    const context = {
      turnId: 'turn-1',
      message: { role: 'user', content: 'ping' },
      contexts: {},
      composedMessage: [],
    } satisfies ChatStreamEventContext

    await chatOrchestratorMock.emitTokenSpecialHooks('manual-special', context)
    await vi.waitFor(() => {
      expect(outgoingStreamMessages).toHaveLength(1)
    })

    streamSender.postMessage({ type: 'token-special', special: 'remote-special', sessionId: 'remote-session', context })
    await waitForBroadcastDelivery()

    expect(outgoingStreamMessages.filter(message => message.sessionId === 'session-1')).toHaveLength(1)

    await store.dispose()
  })

  it('labels outbound stream events with the session that owns the send', async () => {
    const outgoingStreamMessages = collectChannelMessages<{ sessionId: string }>(CHAT_STREAM_CHANNEL_NAME)
    const store = useContextBridgeStore()
    await store.initialize()
    const context = {
      turnId: 'turn-1',
      message: { role: 'user', content: 'ping' },
      contexts: {},
      composedMessage: [],
    } satisfies ChatStreamEventContext

    chatOrchestratorMock.activeSendSessionId = 'session-a'
    activeSessionIdRef.value = 'session-b'
    await chatOrchestratorMock.emitTokenLiteralHooks('session A token', context)
    await vi.waitFor(() => expect(outgoingStreamMessages).toHaveLength(1))

    expect(outgoingStreamMessages[0]?.sessionId).toBe('session-a')
    await store.dispose()
  })

  it('clears remote stream visibility when an end hook rejects', async () => {
    const store = useContextBridgeStore()
    await store.initialize()
    const streamSender = createTestChannel(CHAT_STREAM_CHANNEL_NAME)
    const context = {
      turnId: 'turn-1',
      message: { role: 'user', content: 'ping' },
      contexts: {},
      composedMessage: [],
    } satisfies ChatStreamEventContext
    chatOrchestratorMock.onStreamEnd(async () => {
      throw new Error('end hook failed')
    })
    vi.spyOn(console, 'error').mockImplementation(() => {})

    streamSender.postMessage({ type: 'before-send', message: 'ping', sessionId: 'session-1', context })
    await vi.waitFor(() => expect(store.isReceivingRemoteStream).toBe(true))
    streamSender.postMessage({ type: 'stream-end', sessionId: 'session-1', context })
    await vi.waitFor(() => expect(store.isReceivingRemoteStream).toBe(false))

    expect(resetStreamMock).toHaveBeenCalledTimes(1)
    await store.dispose()
  })

  it('ignores stream events that do not match the active remote session', async () => {
    const store = useContextBridgeStore()
    await store.initialize()
    const streamSender = createTestChannel(CHAT_STREAM_CHANNEL_NAME)
    const context = {
      turnId: 'turn-1',
      message: { role: 'user', content: 'ping' },
      contexts: {},
      composedMessage: [],
    } satisfies ChatStreamEventContext

    streamSender.postMessage({ type: 'before-send', message: 'ping', sessionId: 'session-1', context })
    await vi.waitFor(() => expect(store.isReceivingRemoteStream).toBe(true))
    streamSender.postMessage({ type: 'token-literal', literal: 'foreign token', sessionId: 'session-2', context })
    streamSender.postMessage({ type: 'stream-end', sessionId: 'session-2', context })
    await waitForBroadcastDelivery()

    expect(appendStreamLiteralMock).not.toHaveBeenCalledWith('foreign token')
    expect(store.isReceivingRemoteStream).toBe(true)
    streamSender.postMessage({ type: 'stream-end', sessionId: 'session-1', context })
    await vi.waitFor(() => expect(store.isReceivingRemoteStream).toBe(false))
    await store.dispose()
  })

  it('does not replace the foreground stream for an inactive remote session', async () => {
    const store = useContextBridgeStore()
    await store.initialize()
    const streamSender = createTestChannel(CHAT_STREAM_CHANNEL_NAME)
    const context = {
      turnId: 'turn-2',
      message: { role: 'user', content: 'background ping' },
      contexts: {},
      composedMessage: [],
    } satisfies ChatStreamEventContext

    streamSender.postMessage({ type: 'before-send', message: 'background ping', sessionId: 'session-2', context })
    await waitForBroadcastDelivery()
    expect(beginStreamMock).not.toHaveBeenCalled()
    expect(store.isReceivingRemoteStream).toBe(false)

    streamSender.postMessage({ type: 'stream-end', sessionId: 'session-2', context })
    await waitForBroadcastDelivery()
    expect(resetStreamMock).not.toHaveBeenCalled()
    await store.dispose()
  })

  // https://github.com/moeru-ai/airi/pull/2086#discussion_r3755585351
  it('keeps remote literals received before a mid-stream session switch for Issue #2085', async () => {
    // ROOT CAUSE:
    //
    // The bridge discarded literals while their session was not selected.
    // Selecting that session during the stream showed only later literals.
    activeSessionIdRef.value = 'session-2'
    const store = useContextBridgeStore()
    await store.initialize()
    const streamSender = createTestChannel(CHAT_STREAM_CHANNEL_NAME)
    const context = {
      turnId: 'turn-3',
      message: { role: 'user', content: 'background ping' },
      contexts: {},
      composedMessage: [],
    } satisfies ChatStreamEventContext

    streamSender.postMessage({ type: 'before-send', message: 'background ping', sessionId: 'session-1', context })
    streamSender.postMessage({ type: 'token-literal', literal: 'first half ', sessionId: 'session-1', context })
    await waitForBroadcastDelivery()
    expect(beginStreamMock).not.toHaveBeenCalled()
    expect(appendStreamLiteralMock).not.toHaveBeenCalled()

    activeSessionIdRef.value = 'session-1'
    streamSender.postMessage({ type: 'token-literal', literal: 'second half', sessionId: 'session-1', context })

    await vi.waitFor(() => expect(appendStreamLiteralMock).toHaveBeenCalledTimes(2))
    expect(beginStreamMock).toHaveBeenCalledWith('turn-3')
    expect(appendStreamLiteralMock).toHaveBeenNthCalledWith(1, 'first half ')
    expect(appendStreamLiteralMock).toHaveBeenNthCalledWith(2, 'second half')

    await store.dispose()
  })

  // https://github.com/moeru-ai/airi/pull/2086#discussion_r3755711154
  it('reloads a completed remote stream when its Pocket session becomes active for Issue #2085', async () => {
    // ROOT CAUSE:
    //
    // A plain-Pinia Pocket tab discarded a completed background stream.
    // Its loaded-session cache then prevented a later IndexedDB refresh.
    activeSessionIdRef.value = 'session-1'
    const store = useContextBridgeStore()
    await store.initialize()
    const streamSender = createTestChannel(CHAT_STREAM_CHANNEL_NAME)
    const context = {
      turnId: 'turn-4',
      message: { role: 'user', content: 'background ping' },
      contexts: {},
      composedMessage: [],
    } satisfies ChatStreamEventContext

    streamSender.postMessage({ type: 'before-send', message: 'background ping', sessionId: 'session-2', context })
    streamSender.postMessage({ type: 'token-literal', literal: 'complete answer', sessionId: 'session-2', context })
    streamSender.postMessage({ type: 'stream-end', sessionId: 'session-2', context })
    streamSender.postMessage({ type: 'assistant-end', message: 'complete answer', sessionId: 'session-2', context })
    await waitForBroadcastDelivery()

    expect(refreshSessionMock).not.toHaveBeenCalled()
    expect(resetStreamMock).not.toHaveBeenCalled()

    activeSessionIdRef.value = 'session-2'
    await vi.waitFor(() => expect(refreshSessionMock).toHaveBeenCalledWith('session-2'))
    await vi.waitFor(() => expect(resetStreamMock).toHaveBeenCalledTimes(1))
    expect(beginStreamMock).toHaveBeenCalledWith('turn-4')
    expect(appendStreamLiteralMock).toHaveBeenCalledWith('complete answer')
    expect(store.isReceivingRemoteStream).toBe(false)

    await store.dispose()
  })

  it('ignores remote literal and end events when generation guard is stale', async () => {
    const store = useContextBridgeStore()
    await store.initialize()
    const streamSender = createTestChannel(CHAT_STREAM_CHANNEL_NAME)

    const context = {
      turnId: 'turn-1',
      message: { role: 'user', content: 'ping' },
      contexts: {},
      composedMessage: [],
    } satisfies ChatStreamEventContext

    streamSender.postMessage({ type: 'before-send', message: 'ping', sessionId: 'session-1', context })
    await vi.waitFor(() => {
      expect(beginStreamMock).toHaveBeenCalledWith('turn-1')
    })

    currentGeneration = 8
    streamSender.postMessage({ type: 'token-literal', literal: 'stale-literal', sessionId: 'session-1', context })
    await waitForBroadcastDelivery()

    streamSender.postMessage({ type: 'stream-end', sessionId: 'session-1', context })
    await waitForBroadcastDelivery()

    expect(appendStreamLiteralMock).not.toHaveBeenCalledWith('stale-literal')
    expect(finalizeStreamMock).not.toHaveBeenCalled()
    expect(chatOrchestratorMock.sending).toBe(false)
    expect(store.isReceivingRemoteStream).toBe(false)

    await store.dispose()
  })
})
