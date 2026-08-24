import type { ChatOrchestratorRuntimeDeps } from '@proj-airi/core-agent'

import type { ChatHistoryItem } from '../../../../types/chat'
import type { AnalyticsRecorder } from '../../index'

import { getAnalytics } from '../../index'
import {
  aiGenerationEvent,
  messageRoundEvent,
  messageRoundFailedEvent,
  messageSentEvent,
} from './events'
import { getProviderMode } from './types'

type ChatAnalyticsCallbacks = Pick<
  ChatOrchestratorRuntimeDeps,
  | 'onLlmGeneration'
  | 'onMessageRound'
  | 'onMessageRoundFailed'
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
        trigger_method: hasVoice ? 'voice' : 'text_input',
        trigger_type: 'user_flow_result',
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
        trigger_method: source === 'voice' ? 'voice' : 'text_input',
        trigger_type: 'user_flow_result',
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
        trigger_method: source === 'voice' ? 'voice' : 'text_input',
        trigger_type: 'user_action',
      })
    },
  }
}
