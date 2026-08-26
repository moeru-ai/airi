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

/** Options used to bind analytics to one chat runtime. */
export interface CreateChatAnalyticsHooksOptions {
  /** Typed analytics recorder. Defaults to the module-global recorder. */
  analytics?: AnalyticsRecorder
  /** Reads the message count after the runtime persists a user message. */
  getSessionMessages: (sessionId: string) => ChatHistoryItem[]
}

type ChatAnalyticsCallbacks = Pick<
  ChatOrchestratorRuntimeDeps,
  | 'onLlmGeneration'
  | 'onMessageRound'
  | 'onMessageRoundFailed'
  | 'onTrackFirstMessage'
  | 'onUserMessageAppended'
>

/**
 * Maps core chat runtime callbacks to typed chat product events.
 *
 * The chat store owns session state and streaming. This module owns event
 * names, payload projection, and the provider-cardinality policy.
 */
export function createChatAnalyticsHooks(options: CreateChatAnalyticsHooksOptions): ChatAnalyticsCallbacks {
  const analytics = options.analytics ?? getAnalytics()

  return {
    onLlmGeneration: ({ conversationId, inputTokens, model, outputTokens, provider, roundId, totalTokens, usageSource }) => {
      const providerType = getProviderMode(provider)
      if (providerType !== 'custom')
        return

      analytics.emit(aiGenerationEvent, {
        conversation_id: conversationId,
        input_tokens: inputTokens,
        model_id: model,
        output_tokens: outputTokens,
        provider_id: provider,
        provider_type: providerType,
        round_id: roundId,
        total_tokens: totalTokens,
        usage_source: usageSource,
      })
    },
    onMessageRound: ({ conversationId, durationMs, hasVoice, inputTokens, model, outputTokens, roundId, totalTokens, turnIndex, usageSource }) => {
      analytics.emit(messageRoundEvent, {
        conversation_id: conversationId,
        duration_ms: durationMs,
        has_voice: hasVoice,
        input_tokens: inputTokens,
        model,
        output_tokens: outputTokens,
        round_id: roundId,
        total_tokens: totalTokens,
        trigger_method: hasVoice ? 'voice' : 'text_input',
        trigger_type: 'user_flow_result',
        turn_index: turnIndex,
        usage_source: usageSource,
      })
    },
    onMessageRoundFailed: ({ conversationId, errorCode, failureStage, model, provider, roundId, source, turnIndex }) => {
      analytics.emit(messageRoundFailedEvent, {
        conversation_id: conversationId,
        error_code: errorCode,
        failure_stage: failureStage,
        model_id: model || 'unknown',
        provider_id: provider || 'unknown',
        round_id: roundId,
        source,
        trigger_method: source === 'voice' ? 'voice' : 'text_input',
        trigger_type: 'user_flow_result',
        turn_index: turnIndex,
      })
    },
    onTrackFirstMessage: () => analytics.recordFirstMessage(),
    onUserMessageAppended: ({ message, messageText, model, provider, roundId, sessionId, source, turnIndex }) => {
      const providerType = getProviderMode(provider)
      analytics.emit(messageSentEvent, {
        conversation_id: sessionId,
        has_attachment: false,
        message_id: message.id,
        message_index: options.getSessionMessages(sessionId).length,
        message_length: messageText.length,
        mode: source,
        model: model || 'unknown',
        provider_name: provider || 'unknown',
        provider_type: providerType,
        round_id: roundId,
        trigger_method: source === 'voice' ? 'voice' : 'text_input',
        trigger_type: 'user_action',
        turn_index: turnIndex,
      })
    },
  }
}
