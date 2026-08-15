import type { ChatOrchestratorRuntimeDeps } from '@proj-airi/core-agent'

import type { ChatHistoryItem } from '../../../../types/chat'
import type { AnalyticsRecorder } from '../../index'

import { getAnalytics } from '../../index'
import {
  aiGenerationEvent,
  assistantResponseRenderedEvent,
  chatActivationFailedEvent,
  chatActivationStartedEvent,
  chatActivationSucceededEvent,
  llmFirstTokenEvent,
  llmRequestStartedEvent,
  llmRetryAttemptEvent,
  messageRoundEvent,
  messageRoundFailedEvent,
  messageSendStartedEvent,
  messageSentEvent,
  secondTurnStartedEvent,
} from './events'
import { getProviderMode } from './types'

type ChatAnalyticsCallbacks = Pick<
  ChatOrchestratorRuntimeDeps,
  | 'onAssistantResponseRendered'
  | 'onChatActivationFailed'
  | 'onChatActivationStarted'
  | 'onChatActivationSucceeded'
  | 'onLlmFirstToken'
  | 'onLlmGeneration'
  | 'onLlmRequestStarted'
  | 'onLlmRetryAttempt'
  | 'onMessageRound'
  | 'onMessageRoundFailed'
  | 'onMessageSendStarted'
  | 'onTrackFirstMessage'
  | 'onUserMessageAppended'
>

/** Options used to bind analytics to one chat runtime. */
export interface CreateChatAnalyticsHooksOptions {
  /** Reads the message count after the runtime persists a user message. */
  getSessionMessages: (sessionId: string) => ChatHistoryItem[]
  /** Typed analytics recorder. Defaults to the module-global recorder. */
  analytics?: AnalyticsRecorder
}

/**
 * Maps core chat runtime callbacks to typed chat product events.
 *
 * The chat store owns session state and streaming. This module owns event
 * names, payload projection, and the provider-cardinality policy.
 */
export function createChatAnalyticsHooks(options: CreateChatAnalyticsHooksOptions): ChatAnalyticsCallbacks {
  const analytics = options.analytics ?? getAnalytics()

  return {
    onTrackFirstMessage: () => analytics.recordFirstMessage(),
    onMessageSendStarted: ({ conversationId, roundId, turnIndex, source, model }) => {
      analytics.emit(messageSendStartedEvent, {
        conversation_id: conversationId,
        round_id: roundId,
        turn_index: turnIndex,
        source,
        model,
      })
    },
    onLlmRequestStarted: ({ conversationId, roundId, turnIndex, model, provider, hasVoice }) => {
      analytics.emit(llmRequestStartedEvent, {
        conversation_id: conversationId,
        round_id: roundId,
        turn_index: turnIndex,
        model,
        provider,
        has_voice: hasVoice,
      })
    },
    onLlmFirstToken: ({ conversationId, roundId, turnIndex, model, ttfbMs }) => {
      analytics.emit(llmFirstTokenEvent, {
        conversation_id: conversationId,
        round_id: roundId,
        turn_index: turnIndex,
        model,
        ttfb_ms: ttfbMs,
      })
    },
    onLlmRetryAttempt: ({ conversationId, roundId, turnIndex, model, provider, attempt, delayMs, reason }) => {
      analytics.emit(llmRetryAttemptEvent, {
        conversation_id: conversationId,
        round_id: roundId,
        turn_index: turnIndex,
        model,
        provider,
        attempt,
        delay_ms: delayMs,
        reason,
      })
    },
    onAssistantResponseRendered: ({ conversationId, roundId, turnIndex, model, latencyMs }) => {
      analytics.emit(assistantResponseRenderedEvent, {
        conversation_id: conversationId,
        round_id: roundId,
        turn_index: turnIndex,
        model,
        latency_ms: latencyMs,
      })
    },
    onLlmGeneration: ({ conversationId, roundId, model, provider, inputTokens, outputTokens, totalTokens, usageSource }) => {
      const providerType = getProviderMode(provider)
      if (providerType !== 'custom')
        return

      analytics.emit(aiGenerationEvent, {
        conversation_id: conversationId,
        round_id: roundId,
        provider_type: providerType,
        provider_id: provider,
        model_id: model,
        usage_source: usageSource,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        total_tokens: totalTokens,
      })
    },
    onMessageRound: ({ conversationId, roundId, turnIndex, durationMs, hasVoice, model, inputTokens, outputTokens, totalTokens, usageSource }) => {
      analytics.emit(messageRoundEvent, {
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
      })
    },
    onMessageRoundFailed: ({ conversationId, roundId, turnIndex, model, provider, errorCode, failureStage, source }) => {
      analytics.emit(messageRoundFailedEvent, {
        conversation_id: conversationId,
        round_id: roundId,
        turn_index: turnIndex,
        provider_id: provider || 'unknown',
        model_id: model || 'unknown',
        source,
        error_code: errorCode,
        failure_stage: failureStage,
      })
    },
    onChatActivationStarted: ({ conversationId, roundId, turnIndex, model, provider, source }) => {
      analytics.emit(chatActivationStartedEvent, {
        conversation_id: conversationId,
        provider_mode: getProviderMode(provider),
        provider_id: provider || 'unknown',
        model_id: model || 'unknown',
        round_id: roundId,
        source,
        turn_index: turnIndex,
      })
    },
    onChatActivationSucceeded: ({ conversationId, roundId, turnIndex, model, provider, durationMs, source }) => {
      analytics.emit(chatActivationSucceededEvent, {
        conversation_id: conversationId,
        provider_mode: getProviderMode(provider),
        provider_id: provider || 'unknown',
        model_id: model || 'unknown',
        round_id: roundId,
        time_to_first_message_ms: durationMs,
        source,
        turn_index: turnIndex,
      })
    },
    onChatActivationFailed: ({ conversationId, roundId, turnIndex, model, provider, errorCode, failureStage, source }) => {
      analytics.emit(chatActivationFailedEvent, {
        conversation_id: conversationId,
        provider_mode: getProviderMode(provider),
        provider_id: provider || 'unknown',
        model_id: model || 'unknown',
        round_id: roundId,
        error_code: errorCode,
        failure_stage: failureStage,
        source,
        turn_index: turnIndex,
      })
    },
    onUserMessageAppended: ({ sessionId, message, messageText, source, model, provider, roundId, turnIndex }) => {
      const providerType = getProviderMode(provider)
      analytics.emit(messageSentEvent, {
        conversation_id: sessionId,
        provider_type: providerType,
        provider_name: provider || 'unknown',
        model: model || 'unknown',
        message_id: message.id,
        round_id: roundId,
        turn_index: turnIndex,
        message_index: options.getSessionMessages(sessionId).length,
        message_length: messageText.length,
        has_attachment: false,
        mode: source,
      })
      if (turnIndex !== 2)
        return

      analytics.emit(secondTurnStartedEvent, {
        conversation_id: sessionId,
        provider_mode: providerType,
        provider_id: provider || 'unknown',
        model_id: model || 'unknown',
        round_id: roundId,
        source,
        turn_index: turnIndex,
      })
    },
  }
}
