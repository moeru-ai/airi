import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'

import { useContextBridgeStore } from './context-bridge'

type HookCallback = (...args: any[]) => Promise<void> | void

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
const incomingContextRef = ref<any>(null)
const incomingStreamRef = ref<any>(null)
const broadcastContextMock = vi.fn()
const broadcastStreamMock = vi.fn()

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

function registerHook(target: HookCallback[], callback: HookCallback) {
  target.push(callback)
  return () => {
    const index = target.indexOf(callback)
    if (index >= 0)
      target.splice(index, 1)
  }
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

vi.mock('es-toolkit', () => ({
  Mutex: class {
    async acquire() {}
    release() {}
  },
}))

vi.mock('@vueuse/core', () => ({
  useBroadcastChannel: ({ name }: { name: string }) => {
    if (name === 'airi-context-update') {
      return {
        post: broadcastContextMock,
        data: incomingContextRef,
      }
    }

    return {
      post: broadcastStreamMock,
      data: incomingStreamRef,
    }
  },
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

vi.mock('../../modules/consciousness', () => ({
  useConsciousnessStore: () => ({
    activeProvider: activeProviderRef,
    activeModel: activeModelRef,
  }),
}))

vi.mock('../../providers', () => ({
  useProvidersStore: () => ({
    getProviderInstance: getProviderInstanceMock,
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
  beforeEach(() => {
    setActivePinia(createPinia())

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
    broadcastContextMock.mockReset()
    broadcastStreamMock.mockReset()

    incomingContextRef.value = null
    incomingStreamRef.value = null
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

  it('replays remote stream lifecycle into sending and stream store APIs', async () => {
    const store = useContextBridgeStore()
    await store.initialize()

    const context = {
      message: { role: 'user', content: 'ping' },
      contexts: {},
      composedMessage: [],
    }

    incomingStreamRef.value = { type: 'before-send', message: 'ping', sessionId: 'remote-session', context }
    await nextTick()
    await Promise.resolve()

    expect(chatOrchestratorMock.sending).toBe(true)
    expect(beginStreamMock).toHaveBeenCalledTimes(1)

    incomingStreamRef.value = { type: 'token-literal', literal: 'hello', sessionId: 'remote-session', context }
    await nextTick()
    await Promise.resolve()
    expect(appendStreamLiteralMock).toHaveBeenCalledWith('hello')

    incomingStreamRef.value = { type: 'assistant-end', message: 'final answer', sessionId: 'remote-session', context }
    await nextTick()
    await Promise.resolve()

    // The bridge should call resetStream on follower tabs, not finalizeStream,
    // to avoid corrupting history by persisting a duplicate assistant message.
    expect(finalizeStreamMock).not.toHaveBeenCalled()
    expect(resetStreamMock).toHaveBeenCalledTimes(1)
    expect(chatOrchestratorMock.sending).toBe(false)

    await store.dispose()
  })

  it('suppresses outbound broadcast while processing remote stream events', async () => {
    const store = useContextBridgeStore()
    await store.initialize()

    const context = {
      message: { role: 'user', content: 'ping' },
      contexts: {},
      composedMessage: [],
    }

    await chatOrchestratorMock.emitTokenSpecialHooks('manual-special', context)
    expect(broadcastStreamMock).toHaveBeenCalledTimes(1)
    broadcastStreamMock.mockClear()

    incomingStreamRef.value = { type: 'token-special', special: 'remote-special', sessionId: 'remote-session', context }
    await nextTick()
    await Promise.resolve()

    expect(broadcastStreamMock).not.toHaveBeenCalled()

    await store.dispose()
  })

  it('ignores remote literal and end events when generation guard is stale', async () => {
    const store = useContextBridgeStore()
    await store.initialize()

    const context = {
      message: { role: 'user', content: 'ping' },
      contexts: {},
      composedMessage: [],
    }

    incomingStreamRef.value = { type: 'before-send', message: 'ping', sessionId: 'remote-session', context }
    await nextTick()
    await Promise.resolve()
    expect(beginStreamMock).toHaveBeenCalledTimes(1)

    currentGeneration = 8
    incomingStreamRef.value = { type: 'token-literal', literal: 'stale-literal', sessionId: 'remote-session', context }
    await nextTick()
    await Promise.resolve()

    incomingStreamRef.value = { type: 'stream-end', sessionId: 'remote-session', context }
    await nextTick()
    await Promise.resolve()

    expect(appendStreamLiteralMock).not.toHaveBeenCalledWith('stale-literal')
    expect(finalizeStreamMock).not.toHaveBeenCalled()

    await store.dispose()
  })
})
