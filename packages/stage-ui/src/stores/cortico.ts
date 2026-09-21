import type { CorticoServerFrame } from '@proj-airi/server-sdk-shared'
import type { ChatStreamEventContext } from '../types/chat'

import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { nanoid } from 'nanoid'
import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'

import { useChatSessionStore } from './chat/session-store'
import { useConsciousnessStore } from './modules/consciousness'
import { useProviderConfigStore } from './providers/config'
// Function-level use only: chat.ts imports this store, so a module-level
// binding here would create a cycle. Pinia resolves the store at call time.
import { useChatStore } from './chat'

const DEFAULT_BRIDGE_URL = 'ws://localhost:6122'

/**
 * Drives the Cortico persona path: stage input goes to the bridge as events,
 * persona output comes back as speak/act/delta frames which are replayed
 * through the standard chat hooks so TTS, motion and the chat UI work
 * unchanged.
 */
export const useCorticoStore = defineStore('cortico', () => {
  const enabled = useLocalStorageManualReset<boolean>('settings/cortico/enabled', false)
  const bridgeUrl = useLocalStorageManualReset<string>('settings/cortico/bridge-url', DEFAULT_BRIDGE_URL)

  const connected = ref(false)
  const connecting = ref(false)
  const lastError = ref<string | null>(null)
  /**
   * Multi-window runtimes (tamagotchi) instantiate this store per window.
   * Only the leader window may hold the bridge socket: followers would
   * double-append replies and double-fire TTS/motion hooks. Single-window
   * apps never call `setLeader`, so the default stays connected-capable.
   */
  const isLeader = ref(true)
  /** Draft model output streamed before the persona speaks. */
  const draftText = ref('')

  let socket: WebSocket | null = null
  let turnContext: ChatStreamEventContext | null = null
  let turnComposed = false

  function ensureTurn(): ChatStreamEventContext {
    if (!turnContext) {
      turnContext = {
        turnId: nanoid(),
        message: { role: 'assistant', content: '', slices: [], tool_results: [] },
        contexts: {},
        composedMessage: [],
      }
    }
    return turnContext
  }

  async function emitLiteral(literal: string) {
    const chat = useChatStore()
    const context = ensureTurn()
    if (!turnComposed) {
      turnComposed = true
      await chat.emitBeforeMessageComposedHooks('', context)
    }
    await chat.emitTokenLiteralHooks(literal, context)
  }

  async function emitSpecial(special: string) {
    const chat = useChatStore()
    await chat.emitTokenSpecialHooks(special, ensureTurn())
  }

  async function endTurn() {
    if (!turnContext)
      return
    const chat = useChatStore()
    const context = turnContext
    turnContext = null
    turnComposed = false
    draftText.value = ''
    await chat.emitStreamEndHooks(context)
    await chat.emitAssistantResponseEndHooks('', context)
  }

  /**
   * Human-readable conversation tag, QQ-style. Resolution order: user-set
   * title → persona-assigned name (also stored in title) → first user
   * message snippet → `会话N` by creation order.
   */
  function sessionLabel(sessionId: string): string {
    const session = useChatSessionStore()
    const meta = session.sessionMetas[sessionId]
    if (meta?.title?.trim())
      return meta.title.trim().slice(0, 40)
    const firstUser = (session.getSessionMessagesIfLoaded(sessionId) ?? [])
      .find(m => m.role === 'user' && typeof m.content === 'string' && m.content.trim())
    if (firstUser)
      return String(firstUser.content).trim().slice(0, 20)
    const ordered = Object.values(session.sessionMetas)
      .sort((a, b) => a.createdAt - b.createdAt)
    const idx = ordered.findIndex(m => m.sessionId === sessionId)
    return `会话${idx >= 0 ? idx + 1 : '?'}`
  }

  /** Pushes the session roster so the persona can address conversations. */
  function pushSessions() {
    if (!socket || !connected.value)
      return
    const session = useChatSessionStore()
    socket.send(JSON.stringify({
      type: 'sessions',
      sessions: Object.keys(session.sessionMetas)
        .map(id => ({ id, label: sessionLabel(id) })),
    }))
  }

  function onFrame(frame: CorticoServerFrame) {
    const session = useChatSessionStore()
    switch (frame.type) {
      case 'delta': {
        // Uncommitted model output: surface as the draft indicator only.
        draftText.value += frame.text
        break
      }
      case 'speak': {
        const targetId = frame.sessionId ?? session.activeSessionId
        // Channel conversations live on the bridge; only append to sessions
        // the stage actually has (appendSessionMessage would mint one).
        if (session.getSessionMessagesIfLoaded(targetId)) {
          session.appendSessionMessage(targetId, {
            role: 'assistant',
            content: frame.text,
            slices: [{ type: 'text', text: frame.text }],
            tool_results: [],
            createdAt: Date.now(),
          })
        }
        void emitLiteral(frame.text)
        break
      }
      case 'act': {
        const payload: Record<string, unknown> = {}
        if (frame.emotion)
          payload.emotion = frame.emotion
        if (frame.motion)
          payload.motion = frame.motion
        if (Object.keys(payload).length > 0)
          void emitSpecial(`<|ACT ${JSON.stringify(payload)}|>`)
        if (frame.delay !== undefined)
          void emitSpecial(`<|DELAY ${frame.delay}|>`)
        break
      }
      case 'call': {
        const callPayload = frame.payload === undefined ? [frame.name] : [frame.name, frame.payload]
        void emitSpecial(`<|CALL ${JSON.stringify(callPayload)}|>`)
        break
      }
      case 'name_session': {
        const meta = session.sessionMetas[frame.sessionId]
        if (meta) {
          session.sessionMetas[frame.sessionId] = { ...meta, title: frame.label }
          session.persistSessionMessages(frame.sessionId)
        }
        break
      }
      case 'turn_end':
        void endTurn()
        break
      case 'sys':
        break
    }
  }

  function connect() {
    if (!isLeader.value)
      return
    if (socket || connecting.value)
      return
    connecting.value = true
    lastError.value = null
    const ws = new WebSocket(bridgeUrl.value || DEFAULT_BRIDGE_URL)
    socket = ws
    ws.onopen = () => {
      if (socket !== ws) {
        // Stale attempt (disconnect raced the handshake): drop it quietly and
        // release the connecting flag — no live socket is mid-handshake.
        connecting.value = false
        ws.close()
        return
      }
      connecting.value = false
      connected.value = true
      ws.send(JSON.stringify({ type: 'hello', name: 'user' }))
      pushProvider()
      pushSessions()
    }
    ws.onmessage = (event) => {
      if (socket !== ws)
        return
      try {
        onFrame(JSON.parse(String(event.data)) as CorticoServerFrame)
      }
      catch {
        // Malformed frames are ignored; the bridge owns the protocol.
      }
    }
    ws.onclose = () => {
      // A stale socket's close must not clear the live connection's state.
      if (socket !== ws)
        return
      socket = null
      connected.value = false
      connecting.value = false
      void endTurn()
    }
    ws.onerror = () => {
      if (socket === ws)
        lastError.value = 'Cortico bridge unreachable'
    }
  }

  function disconnect() {
    // Detach before closing so the socket's own onclose can't clear state.
    const ws = socket
    socket = null
    connected.value = false
    connecting.value = false
    ws?.close()
  }

  /** Called by the chat store's leadership listener in multi-window apps. */
  function setLeader(leader: boolean) {
    isLeader.value = leader
  }

  /** Sends user text to the persona as an `airi.user_message` event. */
  async function send(text: string, images?: string[], sessionId?: string) {
    if (!connected.value) {
      connect()
      const deadline = Date.now() + 5000
      while (!connected.value && Date.now() < deadline)
        await new Promise(resolve => setTimeout(resolve, 100))
    }
    if (!socket || !connected.value)
      throw new Error('Cortico bridge is not connected')
    const session = useChatSessionStore()
    const targetId = sessionId ?? session.activeSessionId
    socket.send(JSON.stringify({
      type: 'msg',
      text,
      ...(images?.length ? { images } : {}),
      ...(targetId ? { session: { id: targetId, label: sessionLabel(targetId) } } : {}),
    }))
  }

  /**
   * Pushes the stage's active chat provider to the bridge so generation
   * happens through the endpoint configured in AIRI settings.
   */
  function pushProvider() {
    if (!socket || !connected.value)
      return
    const consciousness = useConsciousnessStore()
    const providerConfig = useProviderConfigStore()
    const providerId = consciousness.activeProvider
    const model = consciousness.activeModel
    const config = providerId ? providerConfig.getProviderConfig(providerId) : undefined
    const baseUrl = typeof config?.baseUrl === 'string' ? config.baseUrl.trim() : ''
    const apiKey = typeof config?.apiKey === 'string' ? config.apiKey.trim() : ''
    socket.send(JSON.stringify({
      type: 'provider',
      config: baseUrl && model ? { baseUrl, ...(apiKey ? { apiKey } : {}), model } : null,
    }))
  }

  const ready = computed(() => enabled.value && connected.value)

  // Persisted toggle survives reloads; keep the socket in sync with it.
  // Multi-window apps additionally gate on leadership (see isLeader).
  watch([enabled, bridgeUrl, isLeader], ([on, , leader]) => {
    if (on && leader)
      connect()
    else
      disconnect()
  }, { immediate: true })

  // Provider changes in AIRI settings propagate to the bridge.
  watch(
    () => [useConsciousnessStore().activeProvider, useConsciousnessStore().activeModel],
    () => pushProvider(),
  )

  // Session roster changes (new/deleted/renamed) propagate to the bridge.
  watch(
    () => useChatSessionStore().sessionMetas,
    () => pushSessions(),
    { deep: true },
  )

  return {
    enabled,
    bridgeUrl,
    connected,
    connecting,
    lastError,
    draftText,
    ready,
    connect,
    disconnect,
    send,
    setLeader,
  }
})
