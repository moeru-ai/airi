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
      getSessionMessages: () => [{ content: 'Hello', role: 'user' }],
    })

    hooks.onUserMessageAppended?.({
      message: { content: 'Hello', id: 'message-1', role: 'user' },
      messageText: 'Hello',
      model: 'selected-model',
      provider: 'official-provider-chat',
      roundId: 'round-1',
      sessionId: 'session-1',
      source: 'voice',
      turnIndex: 2,
    })

    expect(analytics.emit).toHaveBeenCalledWith(messageSentEvent, {
      conversation_id: 'session-1',
      has_attachment: false,
      message_id: 'message-1',
      message_index: 1,
      message_length: 5,
      mode: 'voice',
      model: 'selected-model',
      provider_name: 'official-provider-chat',
      provider_type: 'official',
      round_id: 'round-1',
      trigger_method: 'voice',
      trigger_type: 'user_action',
      turn_index: 2,
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
      inputTokens: 12,
      model: 'custom-model',
      outputTokens: 8,
      provider: 'custom-provider',
      roundId: 'round-1',
      totalTokens: 20,
      turnIndex: 1,
      usageSource: 'reported',
    })
    hooks.onLlmGeneration?.({
      conversationId: 'session-1',
      model: 'official-model',
      provider: 'official-provider-chat',
      roundId: 'round-2',
      turnIndex: 2,
      usageSource: 'reported',
    })

    expect(analytics.emit).toHaveBeenCalledTimes(1)
    expect(analytics.emit).toHaveBeenCalledWith(aiGenerationEvent, {
      conversation_id: 'session-1',
      input_tokens: 12,
      model_id: 'custom-model',
      output_tokens: 8,
      provider_id: 'custom-provider',
      provider_type: 'custom',
      round_id: 'round-1',
      total_tokens: 20,
      usage_source: 'reported',
    })
  })
})
