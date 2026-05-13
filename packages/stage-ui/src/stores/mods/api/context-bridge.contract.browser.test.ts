import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

import { CHAT_STREAM_CHANNEL_NAME } from '../../chat/constants'

type HookCallback = (...args: any[]) => Promise<void> | void
type UseContextBridgeStore = typeof import('./context-bridge')['useContextBridgeStore']

const chatContextIngestMock = vi.fn()
const beginStreamMock = vi.fn()
const appendStreamLiteralMock = vi.fn()
const finalizeStreamMock = vi.fn()
const resetStreamMock = vi.fn()
const serverSendMock = vi.fn()
const ensureConnectedMock = vi.fn().mockResolvedValue(undefined)
const onReconnectedMock = vi.fn(() => () => {})
const onContextUpdateMock = vi.fn(() => () => {})
const onEventMock = vi.fn(() => () => {})
const getProviderInstanceMock = vi.fn()

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
const testChannels: BroadcastChannel[] = []
let useContextBridgeStore: UseContextBridgeStore

function registerHook(target: HookCallback[], callback: HookCallback) {
  target.push(callback)
  return () => {
    const index = target.indexOf(callback)
    if (index >= 0)
      target.splice(index, 1)
  }
}

function createTestChannel(name: string) {
  const channel = new BroadcastChannel(name)
  testChannels.push(channel)
  return channel
}

function collectChannelMessages<T>(name: string) {
  const messages: T[] = []
  const channel = createTestChannel(name)
  channel.addEventListener('message', (event) => {
    messages.push((event as MessageEvent<T>).data)
  })
  return messages
}

function closeTestChannels() {
  for (const channel of testChannels) {
    channel.close()
  }
  testChannels.length = 0
}

async function waitForBroadcastDelivery() {
  await new Promise(resolve => setTimeout(resolve, 50))
}

async function emitHooks(target: HookCallback[], ...args: any[]) {
  for (const callback of target) {
    await callback(...args)
  }
}

const chatOrchestratorMock = {
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

  emitBeforeMessageComposedHooks: (...args: any[]) => emitHooks(beforeComposeHooks, ...args),
  emitAfterMessageComposedHooks: (...args: any[]) => emitHooks(afterComposeHooks, ...args),
  emitBeforeSendHooks: (...args: any[]) => emitHooks(beforeSendHooks, ...args),
  emitAfterSendHooks: (...args: any[]) => emitHooks(afterSendHooks, ...args),
  emitTokenLiteralHooks: (...args: any[]) => emitHooks(tokenLiteralHooks, ...args),
  emitTokenSpecialHooks: (...args: any[]) => emitHooks(tokenSpecialHooks, ...args),
  emitStreamEndHooks: (...args: any[]) => emitHooks(streamEndHooks, ...args),
  emitAssistantResponseEndHooks: (...args: any[]) => emitHooks(assistantEndHooks, ...args),
}

vi.mock('pinia', async () => {
  const actual = await vi.importActual<typeof import('pinia')>('pinia')
  return {
    ...actual,
    storeToRefs: (store: any) => store,
  }
})

vi.mock('@proj-airi/stage-shared', () => ({
  isStageWeb: () => true,
  isStageTamagotchi: () => false,
}))

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
  useChatOrchestratorStore: () => chatOrchestratorMock,
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
    recordLifecycle: vi.fn(),
  }),
}))

vi.mock('../../modules/consciousness', () => ({
  useConsciousnessStore: () => ({
    activeProvider: activeProviderRef,
    activeModel: activeModelRef,
  }),
}))

vi.mock('../../providers', () => ({
  useProvidersStore: () => ({
    configuredSpeechProvidersMetadata: [],
    getProviderConfig: vi.fn(() => ({})),
    getProviderInstance: getProviderInstanceMock,
    getProviderMetadata: vi.fn(() => ({
      capabilities: {},
    })),
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
    serverSendMock.mockReset()
    ensureConnectedMock.mockClear()
    ensureConnectedMock.mockResolvedValue(undefined)
    onReconnectedMock.mockClear()
    onContextUpdateMock.mockClear()
    onEventMock.mockClear()
    getProviderInstanceMock.mockReset()
    chatOrchestratorMock.ingest.mockReset()

    activeProviderRef.value = null
    activeModelRef.value = null
    activeSessionIdRef.value = 'session-1'
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
  })

  afterEach(() => {
    closeTestChannels()
  })

  it('replays remote stream lifecycle into sending and stream store APIs', async () => {
    const store = useContextBridgeStore()
    await store.initialize()
    const streamSender = createTestChannel(CHAT_STREAM_CHANNEL_NAME)

    const context = {
      message: { role: 'user', content: 'ping' },
      contexts: {},
      composedMessage: [],
    }

    streamSender.postMessage({ type: 'before-send', message: 'ping', sessionId: 'remote-session', context })
    await vi.waitFor(() => {
      expect(chatOrchestratorMock.sending).toBe(true)
      expect(beginStreamMock).toHaveBeenCalledTimes(1)
    })

    streamSender.postMessage({ type: 'token-literal', literal: 'hello', sessionId: 'remote-session', context })
    await vi.waitFor(() => {
      expect(appendStreamLiteralMock).toHaveBeenCalledWith('hello')
    })

    streamSender.postMessage({ type: 'assistant-end', message: 'final answer', sessionId: 'remote-session', context })
    await vi.waitFor(() => {
      expect(resetStreamMock).toHaveBeenCalledTimes(1)
    })

    // The bridge should call resetStream on follower tabs, not finalizeStream,
    // to avoid corrupting history by persisting a duplicate assistant message.
    expect(finalizeStreamMock).not.toHaveBeenCalled()
    expect(chatOrchestratorMock.sending).toBe(false)

    await store.dispose()
  })

  it('suppresses outbound broadcast while processing remote stream events', async () => {
    const outgoingStreamMessages = collectChannelMessages<{ sessionId: string }>(CHAT_STREAM_CHANNEL_NAME)
    const store = useContextBridgeStore()
    await store.initialize()
    const streamSender = createTestChannel(CHAT_STREAM_CHANNEL_NAME)

    const context = {
      message: { role: 'user', content: 'ping' },
      contexts: {},
      composedMessage: [],
    }

    await chatOrchestratorMock.emitTokenSpecialHooks('manual-special', context)
    await vi.waitFor(() => {
      expect(outgoingStreamMessages).toHaveLength(1)
    })

    streamSender.postMessage({ type: 'token-special', special: 'remote-special', sessionId: 'remote-session', context })
    await waitForBroadcastDelivery()

    expect(outgoingStreamMessages.filter(message => message.sessionId === 'session-1')).toHaveLength(1)

    await store.dispose()
  })

  it('ignores remote literal and end events when generation guard is stale', async () => {
    const store = useContextBridgeStore()
    await store.initialize()
    const streamSender = createTestChannel(CHAT_STREAM_CHANNEL_NAME)

    const context = {
      message: { role: 'user', content: 'ping' },
      contexts: {},
      composedMessage: [],
    }

    streamSender.postMessage({ type: 'before-send', message: 'ping', sessionId: 'remote-session', context })
    await vi.waitFor(() => {
      expect(beginStreamMock).toHaveBeenCalledTimes(1)
    })

    currentGeneration = 8
    streamSender.postMessage({ type: 'token-literal', literal: 'stale-literal', sessionId: 'remote-session', context })
    await waitForBroadcastDelivery()

    streamSender.postMessage({ type: 'stream-end', sessionId: 'remote-session', context })
    await waitForBroadcastDelivery()

    expect(appendStreamLiteralMock).not.toHaveBeenCalledWith('stale-literal')
    expect(finalizeStreamMock).not.toHaveBeenCalled()
    expect(chatOrchestratorMock.sending).toBe(true)

    await store.dispose()
  })
})
