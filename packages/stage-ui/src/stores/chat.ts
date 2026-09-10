import type { ChatOrchestratorRuntimeState, ChatOrchestratorSendOptions, StreamEvent, StreamOptions } from '@proj-airi/core-agent'
import type { WebSocketEventInputs } from '@proj-airi/server-sdk'
import type { ChatProvider } from '@xsai-ext/providers/utils'
import type { Message } from '@xsai/shared-chat'
import type { SyncedPiniaRuntime } from 'pinia-plugin-synced'

import type { ChatHistoryItem, ChatToolReference, StreamingAssistantMessage } from '../types/chat'
import type { ToolCallRerunPayload } from './tool-call-rerun'

import { errorMessageFrom } from '@moeru/std'
import { createChatOrchestratorRuntime } from '@proj-airi/core-agent'
import { IOAttributes, IOEvents, IOSpanNames, IOSubsystems } from '@proj-airi/stage-shared'
import { nanoid } from 'nanoid'
import { defineStore, storeToRefs } from 'pinia'
import { shallowRef, toRaw } from 'vue'

import { getConversationAnalyticsSurface } from '../composables'
import { useAiriRuntimePrompt } from '../composables/use-airi-runtime-prompt'
import { activeTurnSpan, startSpan } from '../composables/use-io-tracer'
import { projectBilingualText } from '../libs/bilingual/parser'
import { extractMessageText, isCloudSyncableMessage } from '../libs/chat-sync'
import { createChatAnalyticsHooks, getProviderMode } from '../libs/product-signals/events/chat'
import {
  AIRI_CHAT_APP_SURFACE_HEADER,
  AIRI_CHAT_ROUND_ID_HEADER,
  AIRI_CHAT_SESSION_ID_HEADER,
} from '../libs/product-signals/headers'
import { useLLM } from './ai/chat-llm/llm'
import { resolveLlmTools } from './ai/chat-llm/tool-resolver'
import { useLlmToolsStore } from './ai/chat-llm/tools'
import { useLlmToolsetPromptsStore } from './ai/chat-llm/toolset-prompts'
import { useAuthStore } from './auth'
import { createMinecraftContext, createRuntimePromptContext, createUserAccountContext, RUNTIME_PROMPT_CONTEXT_ID } from './chat/context-providers'
import { useChatContextStore } from './chat/context-store'
import { useChatSessionStore } from './chat/session-store'
import { useChatStreamStore } from './chat/stream-store'
import { useContextObservabilityStore } from './devtools/context-observability'
import { useAiriCardStore } from './modules/airi-card'
import { useAutonomousArtistryStore } from './modules/artistry-autonomous'
import { useConsciousnessStore } from './modules/consciousness'
import { useWebSearchStore } from './modules/web-search'
import { useSettingsBilingual } from './settings/bilingual'
import { executeToolCallRerun } from './tool-call-rerun'

interface ForkOptions {
  fromSessionId?: string
  atIndex?: number
  reason?: string
  hidden?: boolean
}

/** A serializable chat request that any application context can send to the leader. */
export interface ChatSendPayload {
  /** Image attachments for the new user message. */
  attachments?: { type: 'image', data: string, mimeType: string }[]
  /** Original input metadata for chat hooks and telemetry. */
  input?: WebSocketEventInputs
  /** Session that owns the new turn. */
  sessionId: string
  /** Message that the new user turn replies to in the target session. */
  replyToMessageId?: string
  /** User text for the new turn. */
  text: string
  /** Request-specific tools selected by their model-facing names. */
  tools?: ChatToolReference[]
  /** Request-specific temperature override. */
  temperature?: number
  /** Request-specific top_p override. */
  topP?: number
}

/** The durable messages appended while one chat request executes. */
export interface ChatSendResult {
  messages: ChatHistoryItem[]
  sessionId: string
}

/** Identifies one stored message whose user turn must run again. */
export interface ChatRetryPayload {
  index: number
  sessionId: string
  tools?: ChatToolReference[]
}

/** Identifies one stored tool call that must run again in the leader. */
export interface ChatToolCallRerunPayload extends Omit<ToolCallRerunPayload, 'sessionId' | 'toolset'> {
  sessionId: string
}

type ProviderHistoryMessage = Exclude<ChatHistoryItem, { role: 'error' }>

function toProviderHistory(messages: ChatHistoryItem[]): Message[] {
  return messages.filter((message): message is ProviderHistoryMessage => message.role !== 'error')
}

function isTextDelta(event: StreamEvent): event is Extract<StreamEvent, { type: 'text-delta' }> {
  return event.type === 'text-delta'
}

function retryTextFrom(message: ChatHistoryItem | undefined): string | null {
  if (!message || message.role !== 'user')
    return null

  if (typeof message.content === 'string') {
    const text = message.content.trim()
    return text || null
  }

  if (!Array.isArray(message.content))
    return null

  const text = message.content.reduce<string[]>((texts, part) => {
    if (part.type !== 'text')
      return texts

    const value = part.text?.trim()
    if (value)
      texts.push(value)

    return texts
  }, []).join('\n\n')

  return text || null
}

function retrySourceIndexFrom(messages: ChatHistoryItem[], index: number): number {
  const targetMessage = messages[index]
  if (!targetMessage)
    return -1

  if (targetMessage.role === 'user')
    return index

  if (targetMessage.role !== 'assistant' && targetMessage.role !== 'error')
    return -1

  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    if (messages[cursor]?.role === 'user')
      return cursor
  }

  return -1
}

export type { QueuedSendSnapshot } from '@proj-airi/core-agent'

export const useChatStore = defineStore('chat', () => {
  // Captioned chat splits the bilingual language tags before the text is spoken
  // and stored, so it opts into the instruction. Spark reactions do the same;
  // consumers that never parse it must not opt in.
  const runtimePrompt = useAiriRuntimePrompt({ bilingual: true })
  const bilingualStore = useSettingsBilingual()
  const authStore = useAuthStore()
  const llmStore = useLLM()
  const llmToolsStore = useLlmToolsStore()
  const llmToolsetPromptsStore = useLlmToolsetPromptsStore()
  // Instantiate the web-search store eagerly so its `configured` watcher registers
  // WEB_SEARCH_TOOLSET_PROMPT before getSystemPromptSupplement is read below. The
  // tool resolver that would otherwise be the first to create this store runs after
  // the system prompt is composed, which would expose web_search on the first turn
  // without its paired prompt-injection defense.
  useWebSearchStore()
  const consciousnessStore = useConsciousnessStore()
  const artistryAutonomousStore = useAutonomousArtistryStore()
  const { activeModel, activeProvider } = storeToRefs(consciousnessStore)
  const chatSession = useChatSessionStore()
  const chatStream = useChatStreamStore()
  const chatContext = useChatContextStore()
  const cardStore = useAiriCardStore()
  const contextObservability = useContextObservabilityStore()
  const { activeSessionId } = storeToRefs(chatSession)
  const { streamingMessage } = storeToRefs(chatStream)

  const sending = shallowRef(false)
  const activeSendSessionId = shallowRef<string>()
  const activeStreamingMessage = shallowRef<StreamingAssistantMessage>()
  const pendingQueuedSendCount = shallowRef(0)
  let ownedActiveTurnSpan: typeof activeTurnSpan.value
  let stopLeadershipListener: (() => void) | undefined
  const analyticsHooks = createChatAnalyticsHooks({
    getSessionMessages: sessionId => chatSession.getSessionMessages(sessionId),
  })

  /**
   * Initializes chat state and binds local consumers to synchronized leadership.
   * A promoted renderer restarts the leader-owned cloud consumer.
   */
  async function initialize(syncedPinia: SyncedPiniaRuntime) {
    stopLeadershipListener ??= syncedPinia.onLeadershipChange((isLeader) => {
      if (!isLeader) {
        chatSession.dispose()
        return
      }

      void chatSession.ensureCurrentSession().catch((error) => {
        console.error('[chat] Failed to start chat consumers after leader promotion:', error)
      })
    })

    await chatSession.initialize()
  }

  /** Stops chat consumers that belong to this window. */
  function dispose() {
    stopLeadershipListener?.()
    stopLeadershipListener = undefined
    chatSession.dispose()
  }

  async function streamWithStageAdapters(
    model: string,
    chatProvider: ChatProvider,
    messages: Message[],
    options?: StreamOptions,
  ) {
    let llmTextLength = 0
    let llmOutputChunkCount = 0
    const llmOutputChunkLengths: number[] = []
    const headers = { ...options?.headers }
    if (getProviderMode(activeProvider.value) === 'official' && options?.requestCorrelation) {
      headers[AIRI_CHAT_SESSION_ID_HEADER] = options.requestCorrelation.conversationId
      headers[AIRI_CHAT_ROUND_ID_HEADER] = options.requestCorrelation.roundId
      headers[AIRI_CHAT_APP_SURFACE_HEADER] = getConversationAnalyticsSurface()
    }

    const hadExistingTurn = !!activeTurnSpan.value
    if (!hadExistingTurn) {
      const turnSpan = startSpan(IOSpanNames.InteractionTurn)
      activeTurnSpan.value = turnSpan
      ownedActiveTurnSpan = turnSpan
    }

    const llmSpan = startSpan(IOSpanNames.LLMInference, activeTurnSpan.value, {
      [IOAttributes.Subsystem]: IOSubsystems.LLM,
      [IOAttributes.GenAIRequestModel]: model,
      [IOAttributes.LLMInputMessageCount]: messages.length,
      [IOAttributes.LLMInputUserMessageCount]: messages.filter(message => message.role === 'user').length,
      [IOAttributes.TurnId]: options?.requestCorrelation?.roundId ?? '',
    })
    llmSpan.setAttribute(IOAttributes.LLMInputMessageRoles, messages.map(message => message.role))
    const llmRequestTs = performance.now()
    let llmFirstTokenEmitted = false

    try {
      await llmStore.stream(model, chatProvider, messages, {
        ...options,
        headers,
        onStreamEvent: async (event: StreamEvent) => {
          if (isTextDelta(event)) {
            llmOutputChunkCount += 1
            llmOutputChunkLengths.push(event.text.length)
            if (!llmFirstTokenEmitted) {
              llmFirstTokenEmitted = true
              llmSpan.addEvent(IOEvents.LLMFirstToken, {
                [IOAttributes.LLM_TTFT]: performance.now() - llmRequestTs,
              })
            }
            llmTextLength += event.text.length
          }

          await options?.onStreamEvent?.(event)
        },
      })
    }
    finally {
      llmSpan.setAttribute(IOAttributes.LLMOutputChunkCount, llmOutputChunkCount)
      llmSpan.setAttribute(IOAttributes.LLMOutputChunkLengths, llmOutputChunkLengths)
      llmSpan.setAttribute(IOAttributes.LLMTextLength, llmTextLength)
      llmSpan.end()
    }
  }

  function syncRuntimeState(state: ChatOrchestratorRuntimeState) {
    sending.value = state.sending
    activeSendSessionId.value = state.activeSendSessionId
    // The live bubble is the copy the UI prefers over `streamingMessage`, so it
    // has to be projected too or the reply shows the control tags and the
    // translation while it is still streaming.
    activeStreamingMessage.value = state.activeStreamingMessage
      ? projectBilingualMessage(state.activeStreamingMessage)
      : state.activeStreamingMessage
    pendingQueuedSendCount.value = state.pendingQueuedSendCount
  }

  function settleOwnedActiveTurnSpan() {
    if (!ownedActiveTurnSpan)
      return

    ownedActiveTurnSpan.end()
    if (activeTurnSpan.value === ownedActiveTurnSpan)
      activeTurnSpan.value = undefined
    ownedActiveTurnSpan = undefined
  }

  /**
   * Bilingual settings of the reply that is streaming now.
   *
   * A reply is tagged in the languages its request was composed with. Reading
   * the settings again while it streams would follow a change made mid-reply:
   * switching the spoken language would keep the translation line instead, and
   * turning subtitles off would leave the raw tags in the history. The reply is
   * captured the first time it is seen, so a change applies from the next turn
   * on. One slot is enough because the chat holds one foreground reply.
   *
   * `instructed` records whether the request actually asked for bilingual output,
   * so a reply that merely happens to contain brackets is left alone.
   */
  let bilingualReply: { id?: string, instructed: boolean, languages: string[], ttsLanguage: string } | undefined

  /**
   * Records the settings the turn being composed asks for.
   *
   * Composing the prompt is the moment the instruction is decided, and the only
   * one where the settings are known to match the request. Capturing at the first
   * streamed token instead would follow a change made while the model is still
   * thinking: the reply was asked for tags in one language and would be projected
   * with another, or left with its tags when the feature was switched off.
   */
  function rememberBilingualRequest() {
    bilingualReply = {
      instructed: bilingualStore.enabled,
      languages: bilingualStore.subtitleLanguages,
      ttsLanguage: bilingualStore.ttsLanguage,
    }
  }

  /** Settings the reply was produced with, captured when its request was composed. */
  function settingsOfBilingualReply(replyId: string | undefined) {
    // The request that produced this reply recorded the settings; adopting the
    // reply id is all it takes to hand them to every later patch of that reply.
    if (bilingualReply && bilingualReply.id === undefined) {
      bilingualReply.id = replyId
      return bilingualReply
    }

    // Nothing was recorded for this reply, so the caller did not come through the
    // request path: the settings as they are now are the best available answer.
    // A reply without an id is the same reply, not a new one.
    if (!bilingualReply || (replyId !== undefined && bilingualReply.id !== replyId)) {
      bilingualReply = {
        id: replyId,
        instructed: bilingualStore.enabled,
        languages: bilingualStore.subtitleLanguages,
        ttsLanguage: bilingualStore.ttsLanguage,
      }
    }

    return bilingualReply
  }

  /**
   * Drops the `[EN]`/`[CN]` control tags the bilingual prompt makes the model
   * emit. The Stage caption layer parses them for speech and subtitles, but the
   * chat bubble, the stored history and every later model turn must only see
   * the spoken language.
   *
   * Only a reply that was asked for bilingual output is rewritten: the model
   * only emits these tags on request, and text that carries a bracket for any
   * other reason would lose everything after it.
   */
  function projectBilingualMessage<T extends { id?: string, role?: unknown, content?: unknown, slices?: unknown, providerTranscript?: unknown }>(message: T): T {
    if (message.role !== 'assistant' || typeof message.content !== 'string' || !message.content.includes('['))
      return message

    const { instructed, languages, ttsLanguage } = settingsOfBilingualReply(message.id)
    if (!instructed)
      return message

    const project = (text: string) => projectBilingualText(text, languages, ttsLanguage)
    const slices = Array.isArray(message.slices)
      ? message.slices.map(slice => slice && typeof slice === 'object' && 'type' in slice && slice.type === 'text' && 'text' in slice && typeof slice.text === 'string'
          ? { ...slice, text: project(slice.text) }
          : slice)
      : message.slices

    // A tool round keeps what the provider exchanged as `providerTranscript`, and
    // the next request is built from that instead of from `content`. Only the
    // assistant's own entries carry tags; tool results are tool output.
    const providerTranscript = Array.isArray(message.providerTranscript)
      ? message.providerTranscript.map((entry) => {
          if (!entry || typeof entry !== 'object' || !('role' in entry) || entry.role !== 'assistant' || !('content' in entry) || typeof entry.content !== 'string')
            return entry

          return { ...entry, content: project(entry.content) }
        })
      : undefined

    return {
      ...message,
      content: project(message.content),
      slices,
      ...(providerTranscript ? { providerTranscript } : {}),
    } as T
  }

  /**
   * Drops the control tags from one reply's raw text.
   *
   * The runtime hands the text of a reply to several consumers on its own — the
   * assistant-message hooks, the turn-ready callback — next to the message
   * object. Those need the same projection as the message itself, or the tags
   * travel to whatever reads them.
   */
  function projectBilingualReplyText(text: string, replyId?: string) {
    const { instructed, languages, ttsLanguage } = settingsOfBilingualReply(replyId)
    if (!instructed || !text.includes('['))
      return text

    return projectBilingualText(text, languages, ttsLanguage)
  }

  const runtime = createChatOrchestratorRuntime({
    session: {
      ensureSession: sessionId => chatSession.ensureSession(sessionId),
      getSessionMessages: sessionId => chatSession.getSessionMessages(sessionId).map(message => toRaw(message)),
      appendSessionMessage: (sessionId, message) => chatSession.appendSessionMessage(sessionId, projectBilingualMessage(message)),
      getSessionGeneration: sessionId => chatSession.getSessionGeneration(sessionId),
    },
    context: {
      ingest: envelope => chatContext.ingestContextMessage(envelope),
      snapshot: () => {
        const snapshot = { ...chatContext.getContextsSnapshot() }
        // Account data belongs to this request, not the persistent context registry.
        // A signed-out request therefore cannot inherit the previous account snapshot.
        const account = createUserAccountContext(authStore)
        if (account)
          snapshot[account.contextId] = [account]
        // The registry keeps the last ingest per context, and a provider that
        // returns nothing leaves it alone: a prompt that has become empty would
        // otherwise be replayed from its last non-empty copy. This is how a
        // bilingual instruction outlived the feature being switched off, and the
        // tags then reached the speech engine with nothing left to parse them.
        if (!runtimePrompt.value)
          delete snapshot[RUNTIME_PROMPT_CONTEXT_ID]
        return snapshot
      },
    },
    foregroundStream: {
      patch: (message) => {
        streamingMessage.value = projectBilingualMessage(message)
      },
      reset: () => {
        streamingMessage.value = { role: 'assistant', content: '', slices: [], tool_results: [] }
      },
    },
    llm: {
      stream: streamWithStageAdapters,
    },
    getActiveSessionId: () => activeSessionId.value,
    getActiveProvider: () => activeProvider.value,
    getSystemPromptSupplement: () => llmToolsetPromptsStore.activeToolsetPrompt,
    runtimeContextProviders: [
      () => {
        // Composing the prompt is what decides whether this turn asks for
        // bilingual output, and it runs once per send, before the model is
        // called: record it here so the reply is projected with the settings it
        // was actually produced with.
        rememberBilingualRequest()
        return createRuntimePromptContext(runtimePrompt.value)
      },
      createMinecraftContext,
    ],
    createId: nanoid,
    unwrapMessage: message => toRaw(message),
    onStateChange: syncRuntimeState,
    onSendSettled: settleOwnedActiveTurnSpan,
    ...analyticsHooks,
    onLifecycle: record => contextObservability.recordLifecycle(record),
    onPromptProjection: payload => contextObservability.capturePromptProjection(payload),
    onUserMessageAppended: ({ sessionId, message, messageText, source, model, provider, roundId, turnIndex }) => {
      analyticsHooks.onUserMessageAppended?.({
        sessionId,
        message,
        messageText,
        source,
        model,
        provider,
        roundId,
        turnIndex,
      })
      if (isCloudSyncableMessage(message)) {
        void chatSession.pushMessageToCloud(sessionId, {
          id: message.id,
          role: 'user',
          content: messageText,
          replyToMessageId: message.replyToMessageId,
        })
      }
    },
    onAssistantMessageAppended: ({ sessionId, message }) => {
      if (isCloudSyncableMessage(message) && message.id) {
        // The runtime hands out its own message object, which still carries the
        // tags: another client reads this copy, so project it first.
        const projected = projectBilingualMessage(message)
        void chatSession.pushMessageToCloud(sessionId, {
          id: message.id,
          role: 'assistant',
          content: extractMessageText(projected),
        })
      }
    },
    onUserTurnReady: ({ messageText, sessionMessages }) => {
      const autonomousTarget = cardStore.activeCard?.extensions?.airi?.modules?.artistry?.autonomousTarget || 'user'
      if (autonomousTarget === 'user')
        void artistryAutonomousStore.runArtistTask(messageText, toProviderHistory(sessionMessages))
    },
    onAssistantTurnReady: ({ messageText, sessionMessages }) => {
      const artistry = cardStore.activeCard?.extensions?.airi?.modules?.artistry
      if (artistry?.autonomousEnabled && artistry?.autonomousTarget === 'assistant')
        void artistryAutonomousStore.runArtistTask(projectBilingualReplyText(messageText), toProviderHistory(sessionMessages))
    },
  })

  async function ingest(
    sendingMessage: string,
    options: ChatOrchestratorSendOptions,
    targetSessionId?: string,
  ) {
    return runtime.ingest(sendingMessage, options, targetSessionId)
  }

  function collectToolReferences(sessionId: string, selectedTools: ChatToolReference[] = []): ChatToolReference[] {
    const names = new Set<string>()

    for (const message of chatSession.getSessionMessages(sessionId)) {
      for (const tool of message.tools ?? [])
        names.add(tool.name)
    }

    for (const tool of selectedTools)
      names.add(tool.name)

    return [...names].map(name => ({ name }))
  }

  function appendSendError(sessionId: string, error: unknown) {
    if (!chatSession.getSessionMessagesIfLoaded(sessionId))
      return

    chatSession.appendSessionMessage(sessionId, {
      role: 'error',
      content: errorMessageFrom(error) ?? 'Unknown chat operation failure',
    })
  }

  async function executeSend(payload: ChatSendPayload): Promise<ChatSendResult> {
    const providerId = activeProvider.value
    const modelId = activeModel.value
    if (!providerId || !modelId)
      throw new Error('No active chat provider or model configured')

    if (!await chatSession.loadSession(payload.sessionId))
      throw new Error('Failed to load the target chat session')

    const messageCount = chatSession.getSessionMessages(payload.sessionId).length
    const chatProvider = await consciousnessStore.getChatProviderInstance(providerId)
    if (!chatProvider)
      throw new Error(`Failed to resolve chat provider "${providerId}"`)

    await runtime.ingest(payload.text, {
      model: modelId,
      chatProvider,
      attachments: payload.attachments,
      input: payload.input,
      replyToMessageId: payload.replyToMessageId,
      toolReferences: payload.tools,
      temperature: payload.temperature ?? consciousnessStore.activeTemperature,
      topP: payload.topP ?? consciousnessStore.activeTopP,
      // Resolve this function after the request reaches the per-session queue.
      // The history then contains tool names from every earlier queued turn.
      tools: async () => {
        const references = collectToolReferences(payload.sessionId, payload.tools)
        return llmToolsStore.getToolsByNames(...references.map(tool => tool.name))
      },
    }, payload.sessionId)

    const completedMessages = chatSession.getSessionMessagesIfLoaded(payload.sessionId)
    if (!completedMessages)
      throw new Error('Chat session was removed before send completed')

    return {
      messages: completedMessages
        .slice(messageCount)
        .map(message => structuredClone(toRaw(message))),
      sessionId: payload.sessionId,
    }
  }

  /** Sends one serializable chat request through the elected leader. */
  async function send(payload: ChatSendPayload): Promise<ChatSendResult> {
    try {
      return await executeSend(payload)
    }
    catch (error) {
      appendSendError(payload.sessionId, error)
      throw error
    }
  }

  /** Replaces one stored turn with a new execution of its user message. */
  async function retry(payload: ChatRetryPayload): Promise<ChatSendResult> {
    if (!await chatSession.loadSession(payload.sessionId))
      throw new Error('Failed to load the target chat session')

    const currentMessages = chatSession.getSessionMessages(payload.sessionId)
    const sourceIndex = retrySourceIndexFrom(currentMessages, payload.index)
    if (sourceIndex < 0)
      throw new Error('Retry target has no retriable source message')

    const sourceMessage = currentMessages[sourceIndex]
    const text = retryTextFrom(sourceMessage)
    if (!text)
      throw new Error('Retry target has no retriable user message')

    chatSession.setSessionMessages(payload.sessionId, currentMessages.slice(0, sourceIndex))

    try {
      return await executeSend({
        sessionId: payload.sessionId,
        text,
        replyToMessageId: sourceMessage?.replyToMessageId,
        tools: payload.tools ?? sourceMessage?.tools,
      })
    }
    catch (error) {
      appendSendError(payload.sessionId, error)
      throw error
    }
  }

  /** Runs one stored tool call again and replaces its stored result. */
  async function rerunToolCall(payload: ChatToolCallRerunPayload): Promise<void> {
    if (!await chatSession.loadSession(payload.sessionId))
      throw new Error('Failed to load the target chat session')

    const nextMessages = await executeToolCallRerun({
      messages: chatSession.getSessionMessages(payload.sessionId),
      payload,
      resolveTools: () => resolveLlmTools({
        customTools: llmToolsStore.getToolsByNames(payload.toolName),
      }),
    })
    chatSession.setSessionMessages(payload.sessionId, nextMessages)
  }

  /** Clears one session and stops runtime work that still belongs to it. */
  function cleanup(sessionId: string) {
    chatSession.cleanupMessages(sessionId)
    chatContext.resetContexts()
    runtime.cancelPendingSends(sessionId)
    chatStream.resetStream()
  }

  /** Cancels queued work before permanently removing its owning session. */
  function deleteSession(sessionId: string): Promise<void> {
    runtime.cancelPendingSends(sessionId)
    return chatSession.deleteSession(sessionId)
  }

  async function ingestOnFork(
    sendingMessage: string,
    options: ChatOrchestratorSendOptions,
    forkOptions?: ForkOptions,
  ) {
    const baseSessionId = forkOptions?.fromSessionId ?? activeSessionId.value
    if (!forkOptions)
      return ingest(sendingMessage, options, baseSessionId)

    const forkSessionId = await chatSession.forkSession({
      fromSessionId: baseSessionId,
      atIndex: forkOptions.atIndex,
      reason: forkOptions.reason,
      hidden: forkOptions.hidden,
    })
    return ingest(sendingMessage, options, forkSessionId || baseSessionId)
  }

  function cancelPendingSends(sessionId?: string) {
    runtime.cancelPendingSends(sessionId)
  }

  function getPendingQueuedSendSnapshot() {
    return runtime.getPendingQueuedSendSnapshot()
  }

  return {
    sending,
    activeSendSessionId,
    activeStreamingMessage,
    pendingQueuedSendCount,

    initialize,
    dispose,
    cleanup,
    deleteSession,
    ingest,
    ingestOnFork,
    rerunToolCall,
    retry,
    send,
    cancelPendingSends,
    getPendingQueuedSendSnapshot,

    clearHooks: runtime.hooks.clearHooks,

    emitBeforeMessageComposedHooks: runtime.hooks.emitBeforeMessageComposedHooks,
    emitAfterMessageComposedHooks: runtime.hooks.emitAfterMessageComposedHooks,
    emitBeforeSendHooks: runtime.hooks.emitBeforeSendHooks,
    emitAfterSendHooks: runtime.hooks.emitAfterSendHooks,
    emitTokenLiteralHooks: runtime.hooks.emitTokenLiteralHooks,
    emitTokenSpecialHooks: runtime.hooks.emitTokenSpecialHooks,
    emitStreamEndHooks: runtime.hooks.emitStreamEndHooks,
    emitAssistantResponseEndHooks: runtime.hooks.emitAssistantResponseEndHooks,
    emitAssistantMessageHooks: runtime.hooks.emitAssistantMessageHooks,
    emitChatTurnCompleteHooks: runtime.hooks.emitChatTurnCompleteHooks,

    onBeforeMessageComposed: runtime.hooks.onBeforeMessageComposed,
    onAfterMessageComposed: runtime.hooks.onAfterMessageComposed,
    onBeforeSend: runtime.hooks.onBeforeSend,
    onAfterSend: runtime.hooks.onAfterSend,
    onTokenLiteral: runtime.hooks.onTokenLiteral,
    onTokenSpecial: runtime.hooks.onTokenSpecial,
    onStreamEnd: runtime.hooks.onStreamEnd,
    onAssistantResponseEnd: runtime.hooks.onAssistantResponseEnd,
    // These two hand out the runtime's own message object and the untouched reply
    // text, and the mods context bridge forwards them to other modules. Project
    // at registration, which is a boundary this store owns, so every subscriber
    // sees the text the user sees.
    onAssistantMessage: (callback: Parameters<typeof runtime.hooks.onAssistantMessage>[0]) =>
      runtime.hooks.onAssistantMessage((message, messageText, context) =>
        callback(projectBilingualMessage(message), projectBilingualReplyText(messageText, message.id), context)),
    onChatTurnComplete: (callback: Parameters<typeof runtime.hooks.onChatTurnComplete>[0]) =>
      runtime.hooks.onChatTurnComplete((chat, context) =>
        callback({
          ...chat,
          output: projectBilingualMessage(chat.output),
          outputText: projectBilingualReplyText(chat.outputText, chat.output.id),
        }, context)),
  }
}, {
  synced: {
    actions: ['cleanup', 'deleteSession', 'rerunToolCall', 'retry', 'send'],
    state: true,
  },
})
