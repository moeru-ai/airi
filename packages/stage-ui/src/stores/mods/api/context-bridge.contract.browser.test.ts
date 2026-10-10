import type { ChatStreamEvent, ChatStreamEventContext, ContextMessage } from '../../../types/chat'

import { ContextUpdateStrategy } from '@proj-airi/server-sdk'
import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

import { chatAssetsRepo } from '../../../database/repos/chat-assets.repo'
import { storeChatAsset } from '../../../libs/chat-assets'
import { CHAT_STREAM_CHANNEL_NAME, CONTEXT_CHANNEL_NAME } from '../../chat/constants'
import { useConsciousnessStore } from '../../modules/consciousness'
import { useConsciousnessSettingsStore } from '../../modules/consciousness-settings'
import { useContextBridgeStore } from './context-bridge'
import { createContextChannel } from './context-channel'

type HookCallback = (...args: unknown[]) => Promise<void> | void

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

let pinia: ReturnType<typeof createPinia>
let consciousness: ReturnType<typeof useConsciousnessStore>

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
const storedSessionMessages: Record<string, unknown[]> = {}
let currentGeneration = 7
const testChannels: Array<ReturnType<typeof createContextChannel>> = []

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
  send: vi.fn(),
  cancelPendingSends: vi.fn(),
  cancelTurn: vi.fn(),

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
  emitAssistantMessageHooks: (...args: unknown[]) => emitHooks(assistantMessageHooks, ...args),
  emitChatTurnCompleteHooks: (...args: unknown[]) => emitHooks(turnCompleteHooks, ...args),
}

vi.mock('@proj-airi/stage-shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@proj-airi/stage-shared')>()
  return {
    ...actual,
    isStageWeb: () => true,
    isStageTamagotchi: () => false,
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
    ensureBoundSession: async (binding: string) => `bound:${binding}`,
    getSessionMessagesIfLoaded: (sessionId: string) => storedSessionMessages[sessionId],
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

vi.mock('../../providers/provider', () => ({
  useProviderStore: () => ({
    configuredSpeechProvidersMetadata: [],
    getProviderConfig: vi.fn(() => ({})),
    getProviderInstance: getProviderInstanceMock,
    getChatProviderInstance: getProviderInstanceMock,
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
  beforeEach(() => {
    localStorage.clear()
    pinia = createPinia()
    setActivePinia(pinia)
    consciousness = useConsciousnessStore(pinia)

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
    chatOrchestratorMock.send.mockReset().mockResolvedValue(undefined)
    chatOrchestratorMock.cancelPendingSends.mockReset().mockResolvedValue(undefined)
    chatOrchestratorMock.cancelTurn.mockReset().mockResolvedValue(undefined)

    consciousness.activeProvider = ''
    consciousness.activeModel = ''
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

  afterEach(async () => {
    // A failed assertion skips the test's explicit disposal. Close the bridge
    // before its peers and Pinia scope so later tests cannot receive old hooks.
    await useContextBridgeStore(pinia).dispose()
    closeTestChannels()
    disposePinia(pinia)
    vi.restoreAllMocks()
    localStorage.clear()
  })

  // ROOT CAUSE:
  // Chat output hooks broadcast every reply and its prompt snapshot, including local private turns.
  // Only a transport return address permits module output. Prompt snapshots stay inside the host.
  it.each(['message', 'complete'] as const)('keeps local %s output inside the host', async (kind) => {
    const store = useContextBridgeStore()
    await store.initialize()
    serverSendMock.mockClear()
    const context: ChatStreamEventContext = {
      sessionId: 'session-1',
      turnId: 'private-turn',
      message: { role: 'user', content: 'private question' },
      contexts: {},
      composedMessage: [{ role: 'system', content: 'private system prompt' }],
      input: { type: 'input:text', data: { text: 'private question' } },
    }
    const message = { role: 'assistant', content: 'private reply' }

    if (kind === 'message')
      await emitHooks(assistantMessageHooks, message, message.content, context)
    else
      await emitHooks(turnCompleteHooks, { output: message }, context)

    expect(serverSendMock).not.toHaveBeenCalled()
  })

  it.each(['message', 'complete'] as const)('returns %s output only to its origin without prompt snapshots', async (kind) => {
    const store = useContextBridgeStore()
    await store.initialize()
    serverSendMock.mockClear()
    const context = {
      turnId: 'external-turn',
      message: { role: 'user', content: 'channel question' },
      contexts: { private: [createContextMessage({ text: 'private observation' })] },
      composedMessage: [{ role: 'system', content: 'private system prompt' }],
      input: { type: 'input:text', data: { text: 'channel question', discord: { channelId: 'channel-a' } } },
      outputTarget: 'discord:instance-a',
      outputs: ['connection:discord:instance-a'],
    }
    const message = { role: 'assistant', content: 'channel reply' }

    if (kind === 'message')
      await emitHooks(assistantMessageHooks, message, message.content, context)
    else
      await emitHooks(turnCompleteHooks, { output: message }, context)

    expect(serverSendMock).toHaveBeenCalledTimes(1)
    const output = serverSendMock.mock.calls[0][0]
    expect(output.route).toEqual({ destinations: [{ type: 'connection', connections: ['discord:instance-a'] }] })
    expect(output.data.message).toEqual(message)
    expect(output.data.discord).toEqual({ channelId: 'channel-a' })
    expect(output.data).not.toHaveProperty('gen-ai:chat')
  })

  // ROOT CAUSE:
  // Devtools in another renderer read reply and completion entries from the server broadcast.
  // Directed output removed that feed, so those renderers saw no reply for a turn.
  it('mirrors reply and completion hooks to other renderers without module output', async () => {
    const outgoing = collectChannelMessages<{ type: string, sessionId: string }>(CHAT_STREAM_CHANNEL_NAME)
    const store = useContextBridgeStore()
    await store.initialize()
    serverSendMock.mockClear()
    const context: ChatStreamEventContext = { sessionId: 'session-1', turnId: 'turn-1', message: { role: 'user', content: 'hello' }, contexts: {}, composedMessage: [] }
    const message = { role: 'assistant' as const, content: 'local reply', slices: [], tool_results: [] }

    await emitHooks(assistantMessageHooks, message, message.content, context)
    await emitHooks(turnCompleteHooks, { output: message, outputText: message.content, toolCalls: [] }, context)
    await vi.waitFor(() => expect(outgoing.map(event => event.type)).toEqual(['assistant-message', 'chat-turn-complete']))

    const received: string[] = []
    chatOrchestratorMock.onAssistantMessage(async (_message, text) => {
      received.push(`message:${text as string}`)
    })
    chatOrchestratorMock.onChatTurnComplete(async (chat) => {
      received.push(`complete:${(chat as { outputText: string }).outputText}`)
    })
    const remote = createTestChannel(CHAT_STREAM_CHANNEL_NAME)
    const remoteContext = { ...context, outputTarget: 'discord:instance-a' }
    await remote.postMessage({ type: 'assistant-message', message, messageText: 'remote reply', sessionId: 'session-1', context: remoteContext })
    await remote.postMessage({ type: 'chat-turn-complete', chat: { output: message, outputText: 'remote reply', toolCalls: [] }, sessionId: 'session-1', context: remoteContext })
    await vi.waitFor(() => expect(received).toEqual(['message:remote reply', 'complete:remote reply']))

    // The producing renderer owns module output. A mirror never sends it again.
    expect(serverSendMock).not.toHaveBeenCalled()
    await store.dispose()
  })

  it('lists the images and recordings of the turn in the chat message event', async () => {
    storedSessionMessages['session-1'] = [{
      id: 'turn-1',
      role: 'user',
      content: [
        { type: 'text', text: 'look' },
        { type: 'image_url', image_url: { url: 'airi-asset:image' } },
        { type: 'input_audio', input_audio: { data: 'airi-asset:voice', format: 'wav' } },
      ],
      audioTranscripts: ['hello there'],
    }]
    const store = useContextBridgeStore()
    await store.initialize()

    await emitHooks(assistantMessageHooks, { role: 'assistant', content: 'hi' }, 'hi', {
      sessionId: 'session-1',
      turnId: 'turn-1',
      message: { role: 'user', content: 'look' },
      contexts: {},
      composedMessage: [],
      // Only a reply to a connection leaves the host, so the turn answers one.
      outputTarget: 'discord:instance-a',
      outputs: ['connection:discord:instance-a'],
    })

    const event = serverSendMock.mock.calls.find(([sent]) => sent.type === 'output:gen-ai:chat:message')?.[0]
    expect(event?.data['gen-ai:chat']?.attachments).toEqual([
      { type: 'image', ref: 'airi-asset:image' },
      { type: 'audio', ref: 'airi-asset:voice', mimeType: 'audio/wav', transcript: 'hello there' },
    ])
    delete storedSessionMessages['session-1']
  })

  it('ignores an asset read that the server did not attribute to a module', async () => {
    const ref = await storeChatAsset(new Uint8Array([82, 73, 70, 70]), 'audio/wav', 'session-1')
    const store = useContextBridgeStore()
    await store.initialize()

    // The source claims a module, but the server-stamped sender names no announced module.
    await emitServerEvent('asset:get:request', {
      type: 'asset:get:request',
      data: { ref },
      metadata: { ...createMetadata('discord', 'discord-1'), event: { id: 'request-3' }, sender: { peerId: 'peer-8', modules: [] } },
    })
    await emitServerEvent('asset:get:request', {
      type: 'asset:get:request',
      data: { ref },
      metadata: { ...createMetadata('discord', 'discord-1'), event: { id: 'request-4' } },
    })

    await new Promise(resolve => setTimeout(resolve, 50))
    expect(serverSendMock.mock.calls.filter(([event]) => event.type === 'asset:get:response')).toEqual([])
    await chatAssetsRepo.clear()
  })

  it('answers an asset read to the asking module only', async () => {
    const ref = await storeChatAsset(new Uint8Array([82, 73, 70, 70]), 'audio/wav', 'session-1')
    const store = useContextBridgeStore()
    await store.initialize()

    await emitServerEvent('asset:get:request', {
      type: 'asset:get:request',
      data: { ref },
      metadata: { ...createMetadata('discord', 'discord-1'), event: { id: 'request-1' }, sender: { peerId: 'peer-7', modules: ['discord'] } },
    })
    await emitServerEvent('asset:get:request', {
      type: 'asset:get:request',
      data: { ref: 'airi-asset:missing' },
      metadata: { ...createMetadata('discord', 'discord-1'), event: { id: 'request-2' }, sender: { peerId: 'peer-7', modules: ['discord'] } },
    })

    const answers = () => serverSendMock.mock.calls.filter(([event]) => event.type === 'asset:get:response')
    await vi.waitFor(() => expect(answers()).toHaveLength(2))
    expect(serverSendMock).toHaveBeenCalledWith({
      type: 'asset:get:response',
      data: { ref, mimeType: 'audio/wav', data: 'UklGRg==' },
      metadata: { event: { parentId: 'request-1' } },
      route: { destinations: ['peer:peer-7'] },
    })
    expect(serverSendMock).toHaveBeenCalledWith(expect.objectContaining({
      data: { ref: 'airi-asset:missing', error: expect.stringContaining('missing') },
      metadata: { event: { parentId: 'request-2' } },
    }))
    await chatAssetsRepo.clear()
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

  // Module observations keep their destinations. The pool reads object destinations as readers and gives the rest to the owner.
  it('keeps module observation destinations as the module sent them', async () => {
    const store = useContextBridgeStore()
    await store.initialize()

    await emitContextUpdate(createContextUpdateEvent({ id: 'unaddressed' }))
    await emitContextUpdate(createContextUpdateEvent({ id: 'shared', destinations: { include: ['discord:channel:a'] } }))

    expect(chatContextIngestMock.mock.calls.map(([message]) => [message.id, message.destinations])).toEqual([
      ['unaddressed', undefined],
      ['shared', { include: ['discord:channel:a'] }],
    ])

    await store.dispose()
  })

  // ROOT CAUSE:
  // Input side context used the array form for logical readers, while arrays route transport peers.
  // A sender's transport list became a reader list, and the observation reached no session.
  it('gives input side context the input scene unless the sender names logical readers', async () => {
    const store = useContextBridgeStore()
    await store.initialize()

    await emitServerEvent('input:text', {
      type: 'input:text',
      source: 'discord-bot',
      metadata: createMetadata('discord', 'bot'),
      data: {
        text: 'hello',
        overrides: { binding: 'discord:channel:a' },
        contextUpdates: [
          { strategy: ContextUpdateStrategy.ReplaceSelf, contextId: 'unaddressed', text: 'one' },
          { strategy: ContextUpdateStrategy.ReplaceSelf, contextId: 'transport-routed', text: 'two', destinations: ['instance:discord-bot'] },
          { strategy: ContextUpdateStrategy.ReplaceSelf, contextId: 'shared', text: 'three', destinations: { include: ['discord:channel:b'] } },
        ],
      },
    })

    expect(chatContextIngestMock.mock.calls.map(([message]) => [message.contextId, message.destinations])).toEqual([
      ['unaddressed', { include: ['discord:channel:a'] }],
      ['transport-routed', { include: ['discord:channel:a'] }],
      ['shared', { include: ['discord:channel:b'] }],
    ])

    await store.dispose()
  })

  describe('declared scenes', () => {
    async function announceDiscord(cognition: unknown) {
      await emitServerEvent('registry:modules:sync', {
        type: 'registry:modules:sync',
        data: { modules: [{ name: 'discord', identity: createMetadata('discord', 'bot').source, connectionId: 'discord-connection', cognition }] },
      })
    }

    function discordInput(overrides: Record<string, string>) {
      return emitServerEvent('input:text', {
        type: 'input:text',
        source: 'discord',
        metadata: { ...createMetadata('discord', 'bot'), sender: { peerId: 'discord-connection', modules: ['discord'] } },
        data: { text: 'hello', overrides },
      })
    }

    // ROOT CAUSE:
    // Any connection named the owner's session. The reply then carried owner history to that connection.
    it('rejects input from a scened module that names a session outside its scenes', async () => {
      consciousness.activeProvider = 'mock-provider'
      consciousness.activeModel = 'mock-model'
      const store = useContextBridgeStore()
      await store.initialize()
      await announceDiscord({ scenes: [{ binding: 'discord:channel:' }] })
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

      await discordInput({ sessionId: 'session-1' })

      expect(chatOrchestratorMock.send).not.toHaveBeenCalled()
      warn.mockRestore()
      await store.dispose()
    })

    it('sends input in a declared scene to its bound session, never a named one', async () => {
      consciousness.activeProvider = 'mock-provider'
      consciousness.activeModel = 'mock-model'
      const store = useContextBridgeStore()
      await store.initialize()
      await announceDiscord({ scenes: [{ binding: 'discord:channel:' }] })

      await discordInput({ binding: 'discord:channel:a', sessionId: 'session-1' })

      expect(chatOrchestratorMock.send).toHaveBeenCalledTimes(1)
      expect(chatOrchestratorMock.send.mock.calls[0]?.[0]).toMatchObject({ sessionId: 'bound:discord:channel:a', outputTarget: 'discord-connection' })
      await store.dispose()
    })

    // ROOT CAUSE:
    // One connection can carry several modules, and the lookup took the first module of the connection.
    // A scened module behind an unscened one then named the owner's session.
    it('finds the sender by its identity on a shared connection, and rejects an unknown sender', async () => {
      consciousness.activeProvider = 'mock-provider'
      consciousness.activeModel = 'mock-model'
      const store = useContextBridgeStore()
      await store.initialize()
      await emitServerEvent('registry:modules:sync', {
        type: 'registry:modules:sync',
        data: { modules: [
          { name: 'helper', identity: createMetadata('helper', 'tool').source, connectionId: 'discord-connection' },
          { name: 'discord', identity: createMetadata('discord', 'bot').source, connectionId: 'discord-connection', cognition: { scenes: [{ binding: 'discord:channel:' }] } },
        ] },
      })
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

      await discordInput({ sessionId: 'session-1' })
      await emitServerEvent('input:text', {
        type: 'input:text',
        source: 'discord',
        metadata: { sender: { peerId: 'discord-connection', modules: ['discord'] } },
        data: { text: 'who am I', overrides: { sessionId: 'session-1' } },
      })
      expect(chatOrchestratorMock.send).not.toHaveBeenCalled()

      await discordInput({ binding: 'discord:channel:a' })
      expect(chatOrchestratorMock.send.mock.calls[0]?.[0]).toMatchObject({ sessionId: 'bound:discord:channel:a' })
      warn.mockRestore()
      await store.dispose()
    })

    it('rejects input from a module whose scene leaves its namespace', async () => {
      consciousness.activeProvider = 'mock-provider'
      consciousness.activeModel = 'mock-model'
      const store = useContextBridgeStore()
      await store.initialize()
      await announceDiscord({ scenes: [{ binding: 'owner:' }] })
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

      await discordInput({ binding: 'owner:private' })

      expect(chatOrchestratorMock.send).not.toHaveBeenCalled()
      warn.mockRestore()
      await store.dispose()
    })
  })

  // https://github.com/moeru-ai/airi/actions/runs/34237304157/job/102098223378
  // ROOT CAUSE:
  // The old consciousness mock omitted temperature and top-p. Input handling
  // failed before ingest. Use the real store and verify both request settings.
  it('records core ingest result for input context updates and forwards accepted updates', async () => {
    chatContextIngestMock.mockReturnValueOnce({
      sourceKey: 'weather:station-1',
      mutation: 'append',
      entryCount: 1,
    })
    consciousness.activeProvider = 'mock-provider'
    consciousness.activeModel = 'mock-model'
    consciousness.temperature = 0.3
    consciousness.topP = 0.8
    await useConsciousnessSettingsStore().setTemperatureEnabled(true)
    await useConsciousnessSettingsStore().setTopPEnabled(true)
    getProviderInstanceMock.mockResolvedValueOnce({})
    const store = useContextBridgeStore()
    await store.initialize()

    await emitServerEvent('input:text', {
      type: 'input:text',
      source: 'extension-module-host',
      metadata: { ...createMetadata('weather', 'station-1'), sender: { peerId: 'station-connection', modules: ['weather'] } },
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
    expect(chatOrchestratorMock.send).toHaveBeenCalledTimes(1)
    expect(chatOrchestratorMock.send.mock.calls[0]?.[0]).toMatchObject({
      sessionId: 'session-1',
      outputTarget: 'station-connection',
      text: 'hello',
      temperature: 0.3,
      topP: 0.8,
    })
    expect(chatOrchestratorMock.send.mock.calls[0]?.[0]?.input?.data.contextUpdates).toEqual([
      expect.objectContaining({
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
    consciousness.activeProvider = 'mock-provider'
    consciousness.activeModel = 'mock-model'
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
    expect(chatOrchestratorMock.send).toHaveBeenCalledTimes(1)
    expect(chatOrchestratorMock.send.mock.calls[0]?.[0]?.input?.data.contextUpdates).toEqual([])

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
      sessionId: 'session-1',
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

  it('routes remote stream cancellation to the renderer that produced the turn', async () => {
    const store = useContextBridgeStore()
    await store.initialize()
    const streamPeer = createContextChannel()
    testChannels.push(streamPeer)
    const context = {
      sessionId: 'session-1',
      turnId: 'turn-1',
      message: { role: 'user', content: 'ping' },
      contexts: {},
      composedMessage: [],
    } satisfies ChatStreamEventContext

    await chatOrchestratorMock.emitBeforeSendHooks('ping', context)
    await streamPeer.emitStreamCancel({ sessionId: 'session-1', turnId: 'turn-1' })

    await vi.waitFor(() => {
      expect(chatOrchestratorMock.cancelTurn).toHaveBeenCalledWith({ sessionId: 'session-1', turnId: 'turn-1' })
    })
    await store.dispose()
  })

  it('broadcasts cancellation when the producing renderer stops its turn', async () => {
    const store = useContextBridgeStore()
    await store.initialize()
    const streamPeer = createContextChannel()
    testChannels.push(streamPeer)
    const cancellations: Array<{ sessionId: string, turnId: string }> = []
    streamPeer.onStreamCancel((command) => {
      cancellations.push(command)
    })
    const context = {
      sessionId: 'session-1',
      turnId: 'turn-1',
      message: { role: 'user', content: 'ping' },
      contexts: {},
      composedMessage: [],
    } satisfies ChatStreamEventContext

    await chatOrchestratorMock.emitBeforeSendHooks('ping', context)
    await store.cancelRemoteStream('session-1')

    await vi.waitFor(() => {
      expect(cancellations).toEqual([{ sessionId: 'session-1', turnId: 'turn-1' }])
    })
    expect(chatOrchestratorMock.cancelPendingSends).not.toHaveBeenCalled()
    await store.dispose()
  })

  it('retires the producer correlation before cancellation settles', async () => {
    let resolveCancellation: (() => void) | undefined
    chatOrchestratorMock.cancelTurn.mockImplementation(() => new Promise<void>((resolve) => {
      resolveCancellation = resolve
    }))
    const store = useContextBridgeStore()
    await store.initialize()
    const streamPeer = createContextChannel()
    testChannels.push(streamPeer)
    const context = {
      sessionId: 'session-1',
      turnId: 'turn-1',
      message: { role: 'user', content: 'ping' },
      contexts: {},
      composedMessage: [],
    } satisfies ChatStreamEventContext

    await chatOrchestratorMock.emitBeforeSendHooks('ping', context)
    void streamPeer.emitStreamCancel({ sessionId: 'session-1', turnId: 'turn-1' })
    await vi.waitFor(() => expect(chatOrchestratorMock.cancelTurn).toHaveBeenCalledTimes(1))

    await streamPeer.emitStreamCancel({ sessionId: 'session-1', turnId: 'turn-1' })
    expect(chatOrchestratorMock.cancelTurn).toHaveBeenCalledTimes(1)

    resolveCancellation?.()
    await store.dispose()
  })

  it('clears a mirrored stream when another receiver cancels it', async () => {
    const store = useContextBridgeStore()
    await store.initialize()
    const streamPeer = createContextChannel()
    testChannels.push(streamPeer)
    const context = {
      sessionId: 'session-1',
      turnId: 'turn-1',
      message: { role: 'user', content: 'ping' },
      contexts: {},
      composedMessage: [],
    } satisfies ChatStreamEventContext

    await streamPeer.emitStream({ type: 'before-send', message: 'ping', sessionId: 'session-1', context })
    await vi.waitFor(() => expect(store.isReceivingRemoteStream).toBe(true))

    await streamPeer.emitStreamCancel({ sessionId: 'session-1', turnId: 'turn-1' })

    await vi.waitFor(() => expect(store.isReceivingRemoteStream).toBe(false))
    expect(resetStreamMock).toHaveBeenCalledTimes(1)
    expect(chatOrchestratorMock.cancelPendingSends).not.toHaveBeenCalled()
    await store.dispose()
  })

  it('clears failed remote generation and rejects its late tokens', async () => {
    const store = useContextBridgeStore()
    await store.initialize()
    const peer = createContextChannel()
    testChannels.push(peer)
    const context = { sessionId: 'session-1', turnId: 'failed', message: { role: 'user', content: 'ping' }, contexts: {}, composedMessage: [] } satisfies ChatStreamEventContext
    await peer.emitStream({ type: 'before-send', message: 'ping', sessionId: context.sessionId, context })
    await peer.emitStream({ type: 'token-literal', literal: 'partial', sessionId: context.sessionId, context })
    await vi.waitFor(() => expect(appendStreamLiteralMock).toHaveBeenCalledWith('partial'))
    await peer.emitStreamFailed(context)
    await vi.waitFor(() => expect(store.isReceivingRemoteStream).toBe(false))
    await peer.emitStream({ type: 'token-literal', literal: 'late', sessionId: context.sessionId, context })
    await waitForBroadcastDelivery()
    expect(appendStreamLiteralMock).not.toHaveBeenCalledWith('late')
    expect(resetStreamMock).toHaveBeenCalledOnce()
  })

  it('emits cancellation for the correlated remote turn', async () => {
    const store = useContextBridgeStore()
    await store.initialize()
    const streamPeer = createContextChannel()
    testChannels.push(streamPeer)
    const cancellations: Array<{ sessionId: string, turnId: string }> = []
    streamPeer.onStreamCancel((command) => {
      cancellations.push(command)
    })
    const context = {
      sessionId: 'session-1',
      turnId: 'turn-1',
      message: { role: 'user', content: 'ping' },
      contexts: {},
      composedMessage: [],
    } satisfies ChatStreamEventContext

    await streamPeer.emitStream({ type: 'before-send', message: 'ping', sessionId: 'session-1', context })
    await vi.waitFor(() => expect(store.isReceivingRemoteStream).toBe(true))

    await store.cancelRemoteStream('session-1')

    await vi.waitFor(() => {
      expect(cancellations).toEqual([{ sessionId: 'session-1', turnId: 'turn-1' }])
    })
    expect(store.isReceivingRemoteStream).toBe(false)
    expect(resetStreamMock).toHaveBeenCalledTimes(1)
    await store.dispose()
  })

  it('suppresses outbound broadcast while processing remote stream events', async () => {
    const outgoingStreamMessages = collectChannelMessages<{ sessionId: string }>(CHAT_STREAM_CHANNEL_NAME)
    const store = useContextBridgeStore()
    await store.initialize()
    const streamSender = createTestChannel(CHAT_STREAM_CHANNEL_NAME)

    const context = {
      sessionId: 'remote-session',
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

    // The sender and local hook each publish once. Remote handling must not echo the sender.
    expect(outgoingStreamMessages.filter(message => message.sessionId === 'remote-session')).toHaveLength(2)

    await store.dispose()
  })

  it('labels outbound stream events with the session that owns the send', async () => {
    const outgoingStreamMessages = collectChannelMessages<{ sessionId: string }>(CHAT_STREAM_CHANNEL_NAME)
    const store = useContextBridgeStore()
    await store.initialize()
    // The context names its own session. Concurrent sends cannot borrow another send's owner.
    const context = {
      sessionId: 'session-a',
      turnId: 'turn-1',
      message: { role: 'user', content: 'ping' },
      contexts: {},
      composedMessage: [],
    } satisfies ChatStreamEventContext

    chatOrchestratorMock.activeSendSessionId = 'session-c'
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
      sessionId: 'session-1',
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
      sessionId: 'session-1',
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
    streamSender.postMessage({ type: 'assistant-end', message: 'done', sessionId: 'session-1', context })
    await vi.waitFor(() => expect(store.isReceivingRemoteStream).toBe(false))
    await store.dispose()
  })

  it('does not replace the foreground stream for an inactive remote session', async () => {
    const store = useContextBridgeStore()
    await store.initialize()
    const streamSender = createTestChannel(CHAT_STREAM_CHANNEL_NAME)
    const context = {
      sessionId: 'session-2',
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
      sessionId: 'session-1',
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
      sessionId: 'session-2',
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

  // https://github.com/moeru-ai/airi/pull/2741#discussion_r4170050033
  it('reports no live remote activity after a background response completes', async () => {
    // ROOT CAUSE:
    //
    // `assistant-end` marks a background remote guard completed and keeps it for
    // the later refresh. `remoteStreamSessionId` then names a finished response.
    //
    // After: `liveRemoteStreamSessionId` publishes the guard only while it is not
    // completed, and has no value after `assistant-end`.
    activeSessionIdRef.value = 'session-1'
    const store = useContextBridgeStore()
    await store.initialize()
    const streamSender = createTestChannel(CHAT_STREAM_CHANNEL_NAME)
    const context = {
      sessionId: 'session-2',
      turnId: 'turn-5',
      message: { role: 'user', content: 'background ping' },
      contexts: {},
      composedMessage: [],
    } satisfies ChatStreamEventContext

    streamSender.postMessage({ type: 'before-send', message: 'background ping', sessionId: 'session-2', context })
    await vi.waitFor(() => expect(store.liveRemoteStreamSessionId).toBe('session-2'))
    // Each session keeps its own remote stream. The retained id names only the visible session's stream.
    expect(store.remoteStreamSessionId).toBeUndefined()

    streamSender.postMessage({ type: 'assistant-end', message: 'complete answer', sessionId: 'session-2', context })
    await waitForBroadcastDelivery()

    expect(store.liveRemoteStreamSessionId).toBeUndefined()

    await store.dispose()
  })

  it('ignores remote literal and end events when generation guard is stale', async () => {
    const store = useContextBridgeStore()
    await store.initialize()
    const streamSender = createTestChannel(CHAT_STREAM_CHANNEL_NAME)

    const context = {
      sessionId: 'session-1',
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
