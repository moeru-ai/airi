import type { AnalyticsRecorder } from '../../index'

import { describe, expect, it, vi } from 'vitest'

import { messageRoundEvent, messageSentEvent } from './events'
import { createChatAnalyticsHooks } from './runtime'

function createRecorder(): AnalyticsRecorder {
  return {
    emit: vi.fn(() => true),
    recordFirstMessage: vi.fn(() => true),
  }
}

describe('createChatAnalyticsHooks', () => {
  it('keeps the runtime provider, model, and source when it records a user turn', () => {
    const analytics = createRecorder()
    const hooks = createChatAnalyticsHooks({
      analytics,
      getSessionMessages: () => [{ role: 'user', content: 'Hello' }],
    })

    hooks.onUserMessageAppended?.({
      sessionId: 'session-1',
      message: { role: 'user', content: 'Hello', id: 'message-1' },
      messageText: 'Hello',
      source: 'voice',
      model: 'selected-model',
      provider: 'official-provider-chat',
      roundId: 'round-1',
      turnIndex: 2,
    })

    expect(analytics.emit).toHaveBeenCalledWith(messageSentEvent, {
      conversation_id: 'session-1',
      provider_type: 'official',
      provider_name: 'official-provider-chat',
      model: 'selected-model',
      message_id: 'message-1',
      round_id: 'round-1',
      turn_index: 2,
      message_index: 1,
      message_length: 5,
      has_attachment: false,
      mode: 'voice',
      trigger_method: 'voice',
      trigger_type: 'user_action',
    })
    expect(analytics.emit).toHaveBeenCalledTimes(1)
  })

  it('does not expose intermediate chat lifecycle hooks as product events', () => {
    const hooks = createChatAnalyticsHooks({
      analytics: createRecorder(),
      getSessionMessages: () => [],
    })

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
    const hooks = createChatAnalyticsHooks({
      analytics,
      getSessionMessages: () => [],
    })

    hooks.onTrackFirstMessage?.()

    expect(analytics.recordFirstMessage).toHaveBeenCalledOnce()
  })

  it('keeps token usage on completed rounds without a second generation event', () => {
    const analytics = createRecorder()
    const hooks = createChatAnalyticsHooks({ analytics, getSessionMessages: () => [] })

    expect(hooks).not.toHaveProperty('onLlmGeneration')
    hooks.onMessageRound?.({
      conversationId: 'session-1',
      roundId: 'round-1',
      turnIndex: 1,
      model: 'custom-model',
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
      duration_ms: 120,
      input_tokens: 12,
      output_tokens: 8,
      total_tokens: 20,
      usage_source: 'reported',
    }))
  })
})
