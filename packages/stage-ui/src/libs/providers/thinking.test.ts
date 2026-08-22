import type { ChatProviderWithExtraOptions } from '@xsai-ext/providers/utils'

import { describe, expect, it } from 'vitest'

import { chatThinkingCapabilities, withDisabledThinking } from './thinking'

describe('chat thinking capabilities', () => {
  it('defines fixed disable requests for providers', () => {
    expect(chatThinkingCapabilities.openAI.disable).toEqual({ reasoningEffort: 'none' })
    expect(chatThinkingCapabilities.gemini.disable).toEqual({ reasoningEffort: 'none' })
    expect(chatThinkingCapabilities.ollama.disable).toEqual({ reasoningEffort: 'none' })
    expect(chatThinkingCapabilities.openRouter.disable).toEqual({ reasoning: { effort: 'none' } })
    expect(chatThinkingCapabilities.deepSeek.disable).toEqual({ thinking: { type: 'disabled' } })
    expect(chatThinkingCapabilities.together.disable).toEqual({ reasoning: { enabled: false } })
    expect(chatThinkingCapabilities.featherless.disable).toEqual({ chatTemplateKwargs: { enable_thinking: false } })
    expect(chatThinkingCapabilities.novita.disable).toEqual({ enableThinking: false })
  })

  it('keeps the cached provider responsive to setting changes', () => {
    let disableThinking = true
    const provider: ChatProviderWithExtraOptions<string, { seed?: number }> = {
      chat: (model, extraOptions) => ({ baseURL: 'https://example.com/v1/', model, ...extraOptions }),
    }
    const decorated = withDisabledThinking(provider, {
      disable: chatThinkingCapabilities.openAI.disable,
      enabled: () => disableThinking,
    })

    expect(decorated.chat('any-model', { seed: 42 })).toMatchObject({ reasoningEffort: 'none', seed: 42 })

    disableThinking = false

    expect(decorated.chat('any-model')).not.toHaveProperty('reasoningEffort')
  })
})
