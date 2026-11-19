import type { ChatOrchestratorRuntimeDeps } from '@proj-airi/core-agent'

import type { AnalyticsRecorder } from '../../index'

import { getAnalytics } from '../../index'
import {
  messageRoundEvent,
  messageRoundFailedEvent,
} from './events'
import { getProviderMode } from './types'

type ChatAnalyticsCallbacks = Pick<
  ChatOrchestratorRuntimeDeps,
  | 'onMessageRound'
  | 'onMessageRoundFailed'
  | 'onTrackFirstMessage'
>

/** Options used to bind analytics to one chat runtime. */
export interface CreateChatAnalyticsHooksOptions {
  /** Typed analytics recorder. Defaults to the module-global recorder. */
  analytics?: AnalyticsRecorder
}

/**
 * Maps core chat runtime callbacks to typed chat product events.
 *
 * The chat store owns session state and streaming. This module owns event
 * names, payload projection, and the provider-cardinality policy.
 */
export function createChatAnalyticsHooks(options: CreateChatAnalyticsHooksOptions = {}): ChatAnalyticsCallbacks {
  const analytics = options.analytics ?? getAnalytics()

  return {
    onTrackFirstMessage: () => analytics.recordFirstMessage(),
    // One event for each finished round. `message_round_failed` covers the other rounds, so no separate send event exists.
    onMessageRound: ({ conversationId, roundId, turnIndex, durationMs, hasVoice, model, provider, inputTokens, outputTokens, totalTokens, usageSource }) => {
      analytics.emit(messageRoundEvent, {
        conversation_id: conversationId,
        round_id: roundId,
        turn_index: turnIndex,
        duration_ms: durationMs,
        has_voice: hasVoice,
        model,
        provider_type: getProviderMode(provider),
        provider_name: provider || 'unknown',
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
  }
}
