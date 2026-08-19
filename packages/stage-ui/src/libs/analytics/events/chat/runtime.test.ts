import type { AnalyticsRecorder } from '../../index'

import { describe, expect, it, vi } from 'vitest'

import { aiGenerationEvent, messageSentEvent } from './events'
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

  it('records generation usage only for custom providers', () => {
    const analytics = createRecorder()
    const hooks = createChatAnalyticsHooks({
      analytics,
      getSessionMessages: () => [],
    })

    hooks.onLlmGeneration?.({
      conversationId: 'session-1',
      roundId: 'round-1',
      turnIndex: 1,
      model: 'custom-model',
      provider: 'custom-provider',
      inputTokens: 12,
      outputTokens: 8,
      totalTokens: 20,
      usageSource: 'reported',
    })
    hooks.onLlmGeneration?.({
      conversationId: 'session-1',
      roundId: 'round-2',
      turnIndex: 2,
      model: 'official-model',
      provider: 'official-provider-chat',
      usageSource: 'reported',
    })

    expect(analytics.emit).toHaveBeenCalledTimes(1)
    expect(analytics.emit).toHaveBeenCalledWith(aiGenerationEvent, {
      conversation_id: 'session-1',
      round_id: 'round-1',
      provider_type: 'custom',
      provider_id: 'custom-provider',
      model_id: 'custom-model',
      usage_source: 'reported',
      input_tokens: 12,
      output_tokens: 8,
      total_tokens: 20,
    })
  })
})
