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

const activeProviderRef = ref<null | string>(null)
const activeModelRef = ref<null | string>(null)

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

function closeTestChannels() {
  for (const channel of testChannels) {
    channel.dispose(new Error('Context bridge contract test ended'))
  }
  testChannels.length = 0
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

function createContextMessage(overrides: Record<string, unknown> = {}) {
  const id = typeof overrides.id === 'string' ? overrides.id : 'context-1'

  return {
    contextId: typeof overrides.contextId === 'string' ? overrides.contextId : id,
    createdAt: 1,
    id,
    strategy: ContextUpdateStrategy.AppendSelf,
    text: 'context text',
    ...overrides,
  }
}

function createContextUpdateEvent(overrides: Record<string, unknown> = {}) {
  const id = typeof overrides.id === 'string' ? overrides.id : 'context-1'

  return {
    data: {
      contextId: id,
      id,
      strategy: ContextUpdateStrategy.AppendSelf,
      text: 'weather changed',
      ...overrides,
    },
    metadata: createMetadata('weather', 'station-1'),
    source: 'extension-module-host',
    type: 'context:update',
  }
}

function createMetadata(extensionId: string, moduleId: string) {
  return {
    source: {
      extension: {
        id: extensionId,
      },
      id: moduleId,
    },
  }
}

function createTestChannel(name: string) {
  const channel = createContextChannel()
  testChannels.push(channel)
  return {
    postMessage(message: ChatStreamEvent | ContextMessage) {
      return name === CONTEXT_CHANNEL_NAME
        ? channel.emitContext(message as ContextMessage)
        : channel.emitStream(message as ChatStreamEvent)
    },
  }
}

async function emitContextUpdate(event: unknown) {
  await emitHooks(contextUpdateHooks, event)
}

async function emitHooks(target: HookCallback[], ...args: unknown[]) {
  for (const callback of target) {
    await callback(...args)
  }
}

async function emitServerEvent(eventName: string, event: unknown) {
  await emitHooks(serverEventHooks.get(eventName) ?? [], event)
}

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

async function waitForBroadcastDelivery() {
  await new Promise(resolve => setTimeout(resolve, 50))
}

const chatOrchestratorMock = {
  activeSendSessionId: undefined as string | undefined,
  emitAfterMessageComposedHooks: (...args: unknown[]) => emitHooks(afterComposeHooks, ...args),
  emitAfterSendHooks: (...args: unknown[]) => emitHooks(afterSendHooks, ...args),

  emitAssistantResponseEndHooks: (...args: unknown[]) => emitHooks(assistantEndHooks, ...args),
  emitBeforeMessageComposedHooks: (...args: unknown[]) => emitHooks(beforeComposeHooks, ...args),
  emitBeforeSendHooks: (...args: unknown[]) => emitHooks(beforeSendHooks, ...args),
  emitStreamEndHooks: (...args: unknown[]) => emitHooks(streamEndHooks, ...args),
  emitTokenLiteralHooks: (...args: unknown[]) => emitHooks(tokenLiteralHooks, ...args),
  emitTokenSpecialHooks: (...args: unknown[]) => emitHooks(tokenSpecialHooks, ...args),
  ingest: vi.fn(),
  onAfterMessageComposed: (callback: HookCallback) => registerHook(afterComposeHooks, callback),
  onAfterSend: (callback: HookCallback) => registerHook(afterSendHooks, callback),
  onAssistantMessage: (callback: HookCallback) => registerHook(assistantMessageHooks, callback),

  onAssistantResponseEnd: (callback: HookCallback) => registerHook(assistantEndHooks, callback),
  onBeforeMessageComposed: (callback: HookCallback) => registerHook(beforeComposeHooks, callback),
  onBeforeSend: (callback: HookCallback) => registerHook(beforeSendHooks, callback),
  onChatTurnComplete: (callback: HookCallback) => registerHook(turnCompleteHooks, callback),
  onStreamEnd: (callback: HookCallback) => registerHook(streamEndHooks, callback),
  onTokenLiteral: (callback: HookCallback) => registerHook(tokenLiteralHooks, callback),
  onTokenSpecial: (callback: HookCallback) => registerHook(tokenSpecialHooks, callback),
  sending: false,
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
    isStageTamagotchi: () => false,
    isStageWeb: () => true,
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
    appendStreamLiteral: appendStreamLiteralMock,
    beginStream: beginStreamMock,
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
    activeModel: activeModelRef,
    activeProvider: activeProviderRef,
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
    onContextUpdate: onContextUpdateMock,
    onEvent: onEventMock,
    onReconnected: onReconnectedMock,
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
      entryCount: 2,
      mutation: 'append',
      sourceKey: 'weather:station-1',
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
      channel: 'broadcast',
      details: expect.objectContaining({
        entryCount: 2,
      }),
      mutation: 'append',
      phase: 'store-ingested',
      sourceKey: 'weather:station-1',
    }))

    await store.dispose()
  })

  it('records core ingest result for server context updates before broadcasting', async () => {
    chatContextIngestMock.mockReturnValueOnce({
      entryCount: 1,
      mutation: 'replace',
      sourceKey: 'weather:station-1',
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
      channel: 'server',
      details: expect.objectContaining({
        entryCount: 1,
      }),
      mutation: 'replace',
      phase: 'store-ingested',
      sourceKey: 'weather:station-1',
    }))
    expect(recordLifecycleMock).toHaveBeenCalledWith(expect.objectContaining({
      channel: 'broadcast',
      contextId: 'server-context',
      phase: 'broadcast-posted',
    }))

    await store.dispose()
  })

  it('records core ingest result for input context updates and forwards accepted updates', async () => {
    chatContextIngestMock.mockReturnValueOnce({
      entryCount: 1,
      mutation: 'append',
      sourceKey: 'weather:station-1',
    })
    activeProviderRef.value = 'mock-provider'
    activeModelRef.value = 'mock-model'
    getProviderInstanceMock.mockResolvedValueOnce({})
    const store = useContextBridgeStore()
    await store.initialize()

    await emitServerEvent('input:text', {
      data: {
        contextUpdates: [
          {
            strategy: ContextUpdateStrategy.AppendSelf,
            text: 'input weather',
          },
        ],
        text: 'hello',
      },
      metadata: createMetadata('weather', 'station-1'),
      source: 'extension-module-host',
      type: 'input:text',
    })

    expect(chatContextIngestMock).toHaveBeenCalledTimes(1)
    expect(recordLifecycleMock).toHaveBeenCalledWith(expect.objectContaining({
      channel: 'input',
      details: expect.objectContaining({
        entryCount: 1,
        inputType: 'input:text',
      }),
      mutation: 'append',
      phase: 'store-ingested',
      sourceKey: 'weather:station-1',
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
        channel: 'broadcast',
        contextId: 'bad-broadcast-context',
        details: expect.objectContaining({
          errorMessage: 'Cannot clone broadcast context',
        }),
        phase: 'store-ingest-rejected',
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
      channel: 'server',
      contextId: 'bad-server-context',
      details: expect.objectContaining({
        errorMessage: 'Cannot clone server context',
      }),
      phase: 'store-ingest-rejected',
    }))
    expect(recordLifecycleMock).not.toHaveBeenCalledWith(expect.objectContaining({
      contextId: 'bad-server-context',
      phase: 'broadcast-posted',
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
      data: {
        contextUpdates: [
          {
            strategy: ContextUpdateStrategy.AppendSelf,
            text: 'bad input weather',
          },
        ],
        text: 'hello',
      },
      metadata: createMetadata('weather', 'station-1'),
      source: 'extension-module-host',
      type: 'input:text',
    })

    expect(recordLifecycleMock).toHaveBeenCalledWith(expect.objectContaining({
      channel: 'input',
      details: expect.objectContaining({
        errorMessage: 'Cannot clone input context',
      }),
      phase: 'store-ingest-rejected',
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
      composedMessage: [],
      contexts: {},
      message: { content: 'ping', role: 'user' },
      turnId: 'turn-1',
    } satisfies ChatStreamEventContext

    streamSender.postMessage({ context, message: 'ping', sessionId: 'session-1', type: 'before-send' })
    await vi.waitFor(() => {
      expect(beginStreamMock).toHaveBeenCalledWith('turn-1')
    })
    expect(chatOrchestratorMock.sending).toBe(false)
    expect(store.isReceivingRemoteStream).toBe(true)

    streamSender.postMessage({ context, literal: 'hello', sessionId: 'session-1', type: 'token-literal' })
    await vi.waitFor(() => {
      expect(appendStreamLiteralMock).toHaveBeenCalledWith('hello')
    })

    streamSender.postMessage({ context, message: 'final answer', sessionId: 'session-1', type: 'assistant-end' })
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
      composedMessage: [],
      contexts: {},
      message: { content: 'ping', role: 'user' },
      turnId: 'turn-1',
    } satisfies ChatStreamEventContext

    await chatOrchestratorMock.emitTokenSpecialHooks('manual-special', context)
    await vi.waitFor(() => {
      expect(outgoingStreamMessages).toHaveLength(1)
    })

    streamSender.postMessage({ context, sessionId: 'remote-session', special: 'remote-special', type: 'token-special' })
    await waitForBroadcastDelivery()

    expect(outgoingStreamMessages.filter(message => message.sessionId === 'session-1')).toHaveLength(1)

    await store.dispose()
  })

  it('labels outbound stream events with the session that owns the send', async () => {
    const outgoingStreamMessages = collectChannelMessages<{ sessionId: string }>(CHAT_STREAM_CHANNEL_NAME)
    const store = useContextBridgeStore()
    await store.initialize()
    const context = {
      composedMessage: [],
      contexts: {},
      message: { content: 'ping', role: 'user' },
      turnId: 'turn-1',
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
      composedMessage: [],
      contexts: {},
      message: { content: 'ping', role: 'user' },
      turnId: 'turn-1',
    } satisfies ChatStreamEventContext
    chatOrchestratorMock.onStreamEnd(async () => {
      throw new Error('end hook failed')
    })
    vi.spyOn(console, 'error').mockImplementation(() => {})

    streamSender.postMessage({ context, message: 'ping', sessionId: 'session-1', type: 'before-send' })
    await vi.waitFor(() => expect(store.isReceivingRemoteStream).toBe(true))
    streamSender.postMessage({ context, sessionId: 'session-1', type: 'stream-end' })
    await vi.waitFor(() => expect(store.isReceivingRemoteStream).toBe(false))

    expect(resetStreamMock).toHaveBeenCalledTimes(1)
    await store.dispose()
  })

  it('ignores stream events that do not match the active remote session', async () => {
    const store = useContextBridgeStore()
    await store.initialize()
    const streamSender = createTestChannel(CHAT_STREAM_CHANNEL_NAME)
    const context = {
      composedMessage: [],
      contexts: {},
      message: { content: 'ping', role: 'user' },
      turnId: 'turn-1',
    } satisfies ChatStreamEventContext

    streamSender.postMessage({ context, message: 'ping', sessionId: 'session-1', type: 'before-send' })
    await vi.waitFor(() => expect(store.isReceivingRemoteStream).toBe(true))
    streamSender.postMessage({ context, literal: 'foreign token', sessionId: 'session-2', type: 'token-literal' })
    streamSender.postMessage({ context, sessionId: 'session-2', type: 'stream-end' })
    await waitForBroadcastDelivery()

    expect(appendStreamLiteralMock).not.toHaveBeenCalledWith('foreign token')
    expect(store.isReceivingRemoteStream).toBe(true)
    streamSender.postMessage({ context, sessionId: 'session-1', type: 'stream-end' })
    await vi.waitFor(() => expect(store.isReceivingRemoteStream).toBe(false))
    await store.dispose()
  })

  it('does not replace the foreground stream for an inactive remote session', async () => {
    const store = useContextBridgeStore()
    await store.initialize()
    const streamSender = createTestChannel(CHAT_STREAM_CHANNEL_NAME)
    const context = {
      composedMessage: [],
      contexts: {},
      message: { content: 'background ping', role: 'user' },
      turnId: 'turn-2',
    } satisfies ChatStreamEventContext

    streamSender.postMessage({ context, message: 'background ping', sessionId: 'session-2', type: 'before-send' })
    await waitForBroadcastDelivery()
    expect(beginStreamMock).not.toHaveBeenCalled()
    expect(store.isReceivingRemoteStream).toBe(false)

    streamSender.postMessage({ context, sessionId: 'session-2', type: 'stream-end' })
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
      composedMessage: [],
      contexts: {},
      message: { content: 'background ping', role: 'user' },
      turnId: 'turn-3',
    } satisfies ChatStreamEventContext

    streamSender.postMessage({ context, message: 'background ping', sessionId: 'session-1', type: 'before-send' })
    streamSender.postMessage({ context, literal: 'first half ', sessionId: 'session-1', type: 'token-literal' })
    await waitForBroadcastDelivery()
    expect(beginStreamMock).not.toHaveBeenCalled()
    expect(appendStreamLiteralMock).not.toHaveBeenCalled()

    activeSessionIdRef.value = 'session-1'
    streamSender.postMessage({ context, literal: 'second half', sessionId: 'session-1', type: 'token-literal' })

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
      composedMessage: [],
      contexts: {},
      message: { content: 'background ping', role: 'user' },
      turnId: 'turn-4',
    } satisfies ChatStreamEventContext

    streamSender.postMessage({ context, message: 'background ping', sessionId: 'session-2', type: 'before-send' })
    streamSender.postMessage({ context, literal: 'complete answer', sessionId: 'session-2', type: 'token-literal' })
    streamSender.postMessage({ context, sessionId: 'session-2', type: 'stream-end' })
    streamSender.postMessage({ context, message: 'complete answer', sessionId: 'session-2', type: 'assistant-end' })
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
      composedMessage: [],
      contexts: {},
      message: { content: 'ping', role: 'user' },
      turnId: 'turn-1',
    } satisfies ChatStreamEventContext

    streamSender.postMessage({ context, message: 'ping', sessionId: 'session-1', type: 'before-send' })
    await vi.waitFor(() => {
      expect(beginStreamMock).toHaveBeenCalledWith('turn-1')
    })

    currentGeneration = 8
    streamSender.postMessage({ context, literal: 'stale-literal', sessionId: 'session-1', type: 'token-literal' })
    await waitForBroadcastDelivery()

    streamSender.postMessage({ context, sessionId: 'session-1', type: 'stream-end' })
    await waitForBroadcastDelivery()

    expect(appendStreamLiteralMock).not.toHaveBeenCalledWith('stale-literal')
    expect(finalizeStreamMock).not.toHaveBeenCalled()
    expect(chatOrchestratorMock.sending).toBe(false)
    expect(store.isReceivingRemoteStream).toBe(false)

    await store.dispose()
  })
})
