import type { ChatOrchestratorRuntimeState, ChatOrchestratorSendOptions, StreamEvent, StreamOptions } from '@proj-airi/core-agent'
import type { WebSocketEventInputs } from '@proj-airi/server-sdk'
import type { ChatProvider } from '@xsai-ext/providers/utils'
import type { Message } from '@xsai/shared-chat'
import type {} from 'pinia-plugin-synced'

import type { ChatHistoryItem, ChatToolReference } from '../types/chat'
import type { ToolCallRerunPayload } from './tool-call-rerun'

import { errorMessageFrom } from '@moeru/std'
import { createChatOrchestratorRuntime } from '@proj-airi/core-agent'
import { IOAttributes, IOEvents, IOSpanNames, IOSubsystems } from '@proj-airi/stage-shared'
import { nanoid } from 'nanoid'
import { defineStore, storeToRefs } from 'pinia'
import { ref, toRaw, watch } from 'vue'

import { getConversationAnalyticsSurface, useAnalytics } from '../composables'
import { activeTurnSpan, startSpan } from '../composables/use-io-tracer'
import {
  AIRI_CHAT_APP_SURFACE_HEADER,
  AIRI_CHAT_ROUND_ID_HEADER,
  AIRI_CHAT_SESSION_ID_HEADER,
} from '../libs/analytics-headers'
import { extractMessageText, isCloudSyncableMessage } from '../libs/chat-sync'
import { createMinecraftContext } from './chat/context-providers'
import { useChatContextStore } from './chat/context-store'
import { useChatSessionStore } from './chat/session-store'
import { useChatStreamStore } from './chat/stream-store'
import { useContextObservabilityStore } from './devtools/context-observability'
import { useLLM } from './llm'
import { resolveLlmTools } from './llm-tool-resolver'
import { useLlmToolsStore } from './llm-tools'
import { useLlmToolsetPromptsStore } from './llm-toolset-prompts'
import { useAiriCardStore } from './modules/airi-card'
import { useAutonomousArtistryStore } from './modules/artistry-autonomous'
import { useConsciousnessStore } from './modules/consciousness'
import { useWebSearchStore } from './modules/web-search'
import { useProviderStore } from './providers/provider'
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
  /** User text for the new turn. */
  text: string
  /** Request-specific tools selected by their model-facing names. */
  tools?: ChatToolReference[]
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
  const providerStore = useProviderStore()
  const artistryAutonomousStore = useAutonomousArtistryStore()
  const { activeModel, activeProvider } = storeToRefs(consciousnessStore)
  const {
    trackFirstMessage,
    trackMessageSendStarted,
    trackMessageSent,
    trackLlmRequestStarted,
    trackLlmFirstToken,
    trackAssistantResponseRendered,
    trackAiGeneration,
    trackMessageRound,
    trackMessageRoundFailed,
    trackChatActivationStarted,
    trackChatActivationSucceeded,
    trackChatActivationFailed,
    trackSecondTurnStarted,
  } = useAnalytics()

  const chatSession = useChatSessionStore()
  const chatStream = useChatStreamStore()
  const chatContext = useChatContextStore()
  const cardStore = useAiriCardStore()
  const contextObservability = useContextObservabilityStore()
  const { activeSessionId } = storeToRefs(chatSession)
  const { streamingMessage } = storeToRefs(chatStream)

  const sending = ref(false)
  const pendingQueuedSendCount = ref(0)
  let ownedActiveTurnSpan: typeof activeTurnSpan.value

  async function streamWithStageAdapters(
    model: string,
    chatProvider: ChatProvider,
    messages: Message[],
    options?: StreamOptions,
  ) {
    let llmTextLength = 0
    const headers = { ...options?.headers }
    if (providerMode(activeProvider.value) === 'official' && options?.requestCorrelation) {
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
    })
    const llmRequestTs = performance.now()
    let llmFirstTokenEmitted = false

    try {
      await llmStore.stream(model, chatProvider, messages, {
        ...options,
        headers,
        onStreamEvent: async (event: StreamEvent) => {
          if (isTextDelta(event)) {
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

      llmSpan.setAttribute(IOAttributes.LLMTextLength, llmTextLength)
    }
    finally {
      llmSpan.end()
    }
  }

  function syncRuntimeState(state: ChatOrchestratorRuntimeState) {
    sending.value = state.sending
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
   * Classifies configured chat providers into low-cardinality product analytics buckets.
   */
  function providerMode(providerId: string | undefined): 'official' | 'custom' | 'unknown' {
    if (!providerId)
      return 'unknown'
    return providerId.startsWith('official-provider') ? 'official' : 'custom'
  }

  let lastSendSource: 'text' | 'voice' = 'text'

  const runtime = createChatOrchestratorRuntime({
    session: {
      ensureSession: sessionId => chatSession.ensureSession(sessionId),
      getSessionMessages: sessionId => chatSession.getSessionMessages(sessionId).map(message => toRaw(message)),
      appendSessionMessage: (sessionId, message) => chatSession.appendSessionMessage(sessionId, message),
      getSessionGeneration: sessionId => chatSession.getSessionGeneration(sessionId),
    },
    context: {
      ingest: envelope => chatContext.ingestContextMessage(envelope),
      snapshot: () => chatContext.getContextsSnapshot(),
    },
    foregroundStream: {
      patch: (message) => {
        streamingMessage.value = message
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
      createMinecraftContext,
    ],
    createId: nanoid,
    unwrapMessage: message => toRaw(message),
    onStateChange: syncRuntimeState,
    onSendSettled: settleOwnedActiveTurnSpan,
    onTrackFirstMessage: trackFirstMessage,
    onMessageSendStarted: ({ conversationId, roundId, turnIndex, source, model }) => {
      lastSendSource = source
      trackMessageSendStarted({
        conversation_id: conversationId,
        round_id: roundId,
        turn_index: turnIndex,
        source,
        model,
      })
    },
    onLlmRequestStarted: ({ conversationId, roundId, turnIndex, model, provider, hasVoice }) => trackLlmRequestStarted({
      conversation_id: conversationId,
      round_id: roundId,
      turn_index: turnIndex,
      model,
      provider,
      has_voice: hasVoice,
    }),
    onLlmFirstToken: ({ conversationId, roundId, turnIndex, model, ttfbMs }) => trackLlmFirstToken({
      conversation_id: conversationId,
      round_id: roundId,
      turn_index: turnIndex,
      model,
      ttfb_ms: ttfbMs,
    }),
    onAssistantResponseRendered: ({ conversationId, roundId, turnIndex, model, latencyMs }) => {
      trackAssistantResponseRendered({
        conversation_id: conversationId,
        round_id: roundId,
        turn_index: turnIndex,
        model,
        latency_ms: latencyMs,
      })
    },
    onLlmGeneration: ({ conversationId, roundId, model, provider, inputTokens, outputTokens, totalTokens, usageSource }) => {
      const mode = providerMode(provider)
      // The official path is captured server-side from authoritative upstream usage.
      if (mode !== 'custom')
        return

      trackAiGeneration({
        conversation_id: conversationId,
        round_id: roundId,
        provider_type: mode,
        provider_id: provider,
        model_id: model,
        usage_source: usageSource,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        total_tokens: totalTokens,
      })
    },
    onMessageRound: ({ conversationId, roundId, turnIndex, durationMs, hasVoice, model, inputTokens, outputTokens, totalTokens, usageSource }) => trackMessageRound({
      conversation_id: conversationId,
      round_id: roundId,
      turn_index: turnIndex,
      duration_ms: durationMs,
      has_voice: hasVoice,
      model,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      total_tokens: totalTokens,
      usage_source: usageSource,
    }),
    onMessageRoundFailed: ({ conversationId, roundId, turnIndex, model, provider, errorCode, failureStage, source }) => trackMessageRoundFailed({
      conversation_id: conversationId,
      round_id: roundId,
      turn_index: turnIndex,
      provider_id: provider || 'unknown',
      model_id: model || 'unknown',
      source,
      error_code: errorCode,
      failure_stage: failureStage,
    }),
    onChatActivationStarted: ({ conversationId, roundId, turnIndex, model, provider, source }) => {
      const mode = providerMode(provider)
      const providerId = provider || 'unknown'
      const modelId = model || 'unknown'

      trackChatActivationStarted({
        conversation_id: conversationId,
        provider_mode: mode,
        provider_id: providerId,
        model_id: modelId,
        round_id: roundId,
        source,
        turn_index: turnIndex,
      })
    },
    onChatActivationSucceeded: ({ conversationId, roundId, turnIndex, model, provider, durationMs, source }) => trackChatActivationSucceeded({
      conversation_id: conversationId,
      provider_mode: providerMode(provider),
      provider_id: provider || 'unknown',
      model_id: model || 'unknown',
      round_id: roundId,
      time_to_first_message_ms: durationMs,
      source,
      turn_index: turnIndex,
    }),
    onChatActivationFailed: ({ conversationId, roundId, turnIndex, model, provider, errorCode, failureStage, source }) => {
      trackChatActivationFailed({
        conversation_id: conversationId,
        provider_mode: providerMode(provider),
        provider_id: provider || 'unknown',
        model_id: model || 'unknown',
        round_id: roundId,
        error_code: errorCode,
        failure_stage: failureStage,
        source,
        turn_index: turnIndex,
      })
    },
    onLifecycle: record => contextObservability.recordLifecycle(record),
    onPromptProjection: payload => contextObservability.capturePromptProjection(payload),
    onUserMessageAppended: ({ sessionId, message, messageText, source, model, provider, roundId, turnIndex }) => {
      trackMessageSent({
        conversation_id: sessionId,
        provider_type: providerMode(activeProvider.value),
        provider_name: activeProvider.value || 'unknown',
        model: activeModel.value || 'unknown',
        message_id: message.id,
        round_id: roundId,
        turn_index: turnIndex,
        message_index: chatSession.getSessionMessages(sessionId).length,
        message_length: messageText.length,
        has_attachment: false,
        mode: lastSendSource,
      })
      if (turnIndex === 2) {
        trackSecondTurnStarted({
          conversation_id: sessionId,
          provider_mode: providerMode(provider),
          provider_id: provider || 'unknown',
          model_id: model || 'unknown',
          round_id: roundId,
          source,
          turn_index: turnIndex,
        })
      }

      if (isCloudSyncableMessage(message)) {
        void chatSession.pushMessageToCloud(sessionId, {
          id: message.id,
          role: 'user',
          content: messageText,
        })
      }
    },
    onAssistantMessageAppended: ({ sessionId, message }) => {
      if (isCloudSyncableMessage(message) && message.id) {
        void chatSession.pushMessageToCloud(sessionId, {
          id: message.id,
          role: 'assistant',
          content: extractMessageText(message),
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
        void artistryAutonomousStore.runArtistTask(messageText, toProviderHistory(sessionMessages))
    },
  })

  watch(sending, (next) => {
    if (runtime.getSending() !== next)
      runtime.setSending(next)
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

    const messageCount = chatSession.getSessionMessages(payload.sessionId).length
    const chatProvider = await providerStore.getProviderInstance<ChatProvider>(providerId)
    if (!chatProvider)
      throw new Error(`Failed to resolve chat provider "${providerId}"`)

    await runtime.ingest(payload.text, {
      model: modelId,
      chatProvider,
      attachments: payload.attachments,
      input: payload.input,
      toolReferences: payload.tools,
      // Resolve this function after the request reaches the per-session queue.
      // The history then contains tool names from every earlier queued turn.
      tools: async () => {
        const references = collectToolReferences(payload.sessionId, payload.tools)
        return llmToolsStore.getToolsByNames(...references.map(tool => tool.name))
      },
    }, payload.sessionId)

    return {
      messages: chatSession.getSessionMessages(payload.sessionId)
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
    pendingQueuedSendCount,

    cleanup,
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
    onAssistantMessage: runtime.hooks.onAssistantMessage,
    onChatTurnComplete: runtime.hooks.onChatTurnComplete,
  }
}, {
  synced: {
    actions: ['cleanup', 'rerunToolCall', 'retry', 'send'],
    state: true,
  },
})
