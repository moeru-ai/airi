import type { AnalyticsRecorder } from '../../index'

import { describe, expect, it, vi } from 'vitest'

import { messageRoundEvent } from './events'
import { createChatAnalyticsHooks } from './runtime'

function createRecorder(): AnalyticsRecorder {
  return {
    emit: vi.fn(() => true),
    recordFirstMessage: vi.fn(() => true),
  }
}

describe('createChatAnalyticsHooks', () => {
  it('does not expose intermediate chat lifecycle hooks as product events', () => {
    const hooks = createChatAnalyticsHooks({ analytics: createRecorder() })

    expect(hooks).not.toHaveProperty('onMessageSendStarted')
    expect(hooks).not.toHaveProperty('onLlmRequestStarted')
    expect(hooks).not.toHaveProperty('onLlmFirstToken')
    expect(hooks).not.toHaveProperty('onAssistantResponseRendered')
    expect(hooks).not.toHaveProperty('onChatActivationStarted')
    expect(hooks).not.toHaveProperty('onChatActivationSucceeded')
    expect(hooks).not.toHaveProperty('onChatActivationFailed')
  })

  it('keeps the first-message activation signal', () => {
    const analytics = createRecorder()
    const hooks = createChatAnalyticsHooks({ analytics })

    hooks.onTrackFirstMessage?.()

    expect(analytics.recordFirstMessage).toHaveBeenCalledOnce()
  })

  it('keeps token usage on completed rounds without a second generation event', () => {
    const analytics = createRecorder()
    const hooks = createChatAnalyticsHooks({ analytics })

    expect(hooks).not.toHaveProperty('onLlmGeneration')
    // A sent message is counted by its round. `message_sent` duplicated `message_round` plus `message_round_failed`.
    expect(hooks).not.toHaveProperty('onUserMessageAppended')
    hooks.onMessageRound?.({
      conversationId: 'session-1',
      roundId: 'round-1',
      turnIndex: 1,
      model: 'custom-model',
      provider: 'official-provider-chat',
      durationMs: 120,
      hasVoice: false,
      inputTokens: 12,
      outputTokens: 8,
      totalTokens: 20,
      usageSource: 'reported',
    })

    expect(analytics.emit).toHaveBeenCalledTimes(1)
    expect(analytics.emit).toHaveBeenCalledWith(messageRoundEvent, expect.objectContaining({
      conversation_id: 'session-1',
      round_id: 'round-1',
      model: 'custom-model',
      provider_type: 'official',
      provider_name: 'official-provider-chat',
      duration_ms: 120,
      input_tokens: 12,
      output_tokens: 8,
      total_tokens: 20,
      usage_source: 'reported',
    }))
  })
})
