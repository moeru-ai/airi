import type {
  ChatOrchestratorRuntimeState,
  ChatOrchestratorSendOptions,
  StreamEvent,
  StreamOptions,
} from '@proj-airi/core-agent'
import type { ChatProvider } from '@xsai-ext/providers/utils'
import type { Message } from '@xsai/shared-chat'

import type { ChatHistoryItem } from '../types/chat'

import { createChatOrchestratorRuntime } from '@proj-airi/core-agent'
import { IOAttributes, IOEvents, IOSpanNames, IOSubsystems } from '@proj-airi/stage-shared'
import { nanoid } from 'nanoid'
import { defineStore, storeToRefs } from 'pinia'
import { ref, toRaw, watch } from 'vue'

import { useAnalytics } from '../composables'
import { activeTurnSpan, startSpan } from '../composables/use-io-tracer'
import { extractMessageText, isCloudSyncableMessage } from '../libs/chat-sync'
import { createMinecraftContext } from './chat/context-providers'
import { useChatContextStore } from './chat/context-store'
import { useChatSessionStore } from './chat/session-store'
import { useChatStreamStore } from './chat/stream-store'
import { useContextObservabilityStore } from './devtools/context-observability'
import { useLLM } from './llm'
import { useLlmToolsetPromptsStore } from './llm-toolset-prompts'
import { useAiriCardStore } from './modules/airi-card'
import { useAutonomousArtistryStore } from './modules/artistry-autonomous'
import { useConsciousnessStore } from './modules/consciousness'
import { usePatternDisruptorStore } from './pattern-disruptor'

interface ForkOptions {
  fromSessionId?: string
  atIndex?: number
  reason?: string
  hidden?: boolean
}

type ProviderHistoryMessage = Exclude<ChatHistoryItem, { role: 'error' }>

function toProviderHistory(messages: ChatHistoryItem[]): Message[] {
  return messages.filter((message): message is ProviderHistoryMessage => message.role !== 'error')
}

function isTextDelta(event: StreamEvent): event is Extract<StreamEvent, { type: 'text-delta' }> {
  return event.type === 'text-delta'
}

export type { QueuedSendSnapshot, ChatOrchestratorSendOptions as SendOptions } from '@proj-airi/core-agent'

export const useChatOrchestratorStore = defineStore('chat-orchestrator', () => {
  const llmStore = useLLM()
  const llmToolsetPromptsStore = useLlmToolsetPromptsStore()
  const consciousnessStore = useConsciousnessStore()
  const artistryAutonomousStore = useAutonomousArtistryStore()
  const patternDisruptorStore = usePatternDisruptorStore()
  const { activeProvider } = storeToRefs(consciousnessStore)
  const {
    trackFirstMessage,
    trackMessageSendStarted,
    trackLlmRequestStarted,
    trackLlmFirstToken,
    trackAssistantResponseRendered,
    trackMessageRound,
  } = useAnalytics()

  const chatSession = useChatSessionStore()
  const chatStream = useChatStreamStore()
  const chatContext = useChatContextStore()
  const cardStore = useAiriCardStore()
  const contextObservability = useContextObservabilityStore()
  const { activeSessionId } = storeToRefs(chatSession)
  const { activeCardId } = storeToRefs(cardStore)
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

    const hadExistingTurn = Boolean(activeTurnSpan.value)
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
    } finally {
      llmSpan.end()
    }
  }

  function syncRuntimeState(state: ChatOrchestratorRuntimeState) {
    sending.value = state.sending
    pendingQueuedSendCount.value = state.pendingQueuedSendCount
  }

  function settleOwnedActiveTurnSpan() {
    if (!ownedActiveTurnSpan) return

    ownedActiveTurnSpan.end()
    if (activeTurnSpan.value === ownedActiveTurnSpan) activeTurnSpan.value = undefined
    ownedActiveTurnSpan = undefined
  }

  const runtime = createChatOrchestratorRuntime({
    session: {
      ensureSession: (sessionId) => chatSession.ensureSession(sessionId),
      getSessionMessages: (sessionId) => chatSession.getSessionMessages(sessionId).map((message) => toRaw(message)),
      appendSessionMessage: (sessionId, message) => chatSession.appendSessionMessage(sessionId, message),
      getSessionGeneration: (sessionId) => chatSession.getSessionGeneration(sessionId),
    },
    context: {
      ingest: (envelope) => chatContext.ingestContextMessage(envelope),
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
    getSystemPromptSupplement: () =>
      [llmToolsetPromptsStore.activeToolsetPrompt, patternDisruptorStore.activePromptSupplement]
        .map((section) => section.trim())
        .filter(Boolean)
        .join('\n\n'),
    runtimeContextProviders: [createMinecraftContext],
    createId: nanoid,
    unwrapMessage: (message) => toRaw(message),
    onStateChange: syncRuntimeState,
    onSendSettled: settleOwnedActiveTurnSpan,
    onTrackFirstMessage: trackFirstMessage,
    onMessageSendStarted: ({ source, model }) =>
      trackMessageSendStarted({
        source,
        model,
      }),
    onLlmRequestStarted: ({ model, provider, hasVoice }) =>
      trackLlmRequestStarted({
        model,
        provider,
        has_voice: hasVoice,
      }),
    onLlmFirstToken: ({ model, ttfbMs }) =>
      trackLlmFirstToken({
        model,
        ttfb_ms: ttfbMs,
      }),
    onAssistantResponseRendered: ({ model, latencyMs }) =>
      trackAssistantResponseRendered({
        model,
        latency_ms: latencyMs,
      }),
    onMessageRound: ({ durationMs, hasVoice, model }) =>
      trackMessageRound({
        duration_ms: durationMs,
        has_voice: hasVoice,
        model,
      }),
    onLifecycle: (record) => contextObservability.recordLifecycle(record),
    onPromptProjection: (payload) => contextObservability.capturePromptProjection(payload),
    onUserMessageAppended: ({ sessionId, message, messageText }) => {
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
      patternDisruptorStore.prepareForUserTurn({
        settings: cardStore.activeCard?.extensions?.airi?.modules?.patternDisruptor,
        messageText,
        sessionMessages,
      })

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
    if (runtime.getSending() !== next) runtime.setSending(next)
  })

  watch([activeSessionId, activeCardId], () => {
    patternDisruptorStore.resetState()
  })

  async function ingest(sendingMessage: string, options: ChatOrchestratorSendOptions, targetSessionId?: string) {
    return runtime.ingest(sendingMessage, options, targetSessionId)
  }

  async function ingestOnFork(sendingMessage: string, options: ChatOrchestratorSendOptions, forkOptions?: ForkOptions) {
    const baseSessionId = forkOptions?.fromSessionId ?? activeSessionId.value
    if (!forkOptions) return ingest(sendingMessage, options, baseSessionId)

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

    ingest,
    ingestOnFork,
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
})
