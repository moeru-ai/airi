import type { ChatProviderWithExtraOptions } from '@xsai-ext/providers/utils'

import { describe, expect, it } from 'vitest'

import { chatThinkingCapabilities, withDisabledThinking } from './thinking'

describe('chat thinking capabilities', () => {
  it('disables thinking only for OpenAI models that support none', () => {
    expect(chatThinkingCapabilities.openAI.disable('gpt-5.2')).toEqual({ reasoningEffort: 'none' })
    expect(chatThinkingCapabilities.openAI.disable('openai/gpt-5.4-mini')).toEqual({ reasoningEffort: 'none' })
    expect(chatThinkingCapabilities.openAI.disable('gpt-5')).toBeUndefined()
    expect(chatThinkingCapabilities.openAI.disable('gpt-5.4-pro')).toBeUndefined()
    expect(chatThinkingCapabilities.openAI.disable('gpt-4o')).toBeUndefined()
  })

  it('disables Gemini thinking only for Gemini 2.5 Flash models', () => {
    expect(chatThinkingCapabilities.gemini.disable('gemini-2.5-flash')).toEqual({ reasoningEffort: 'none' })
    expect(chatThinkingCapabilities.gemini.disable('gemini-2.5-flash-lite')).toEqual({ reasoningEffort: 'none' })
    expect(chatThinkingCapabilities.gemini.disable('gemini-2.5-pro')).toBeUndefined()
    expect(chatThinkingCapabilities.gemini.disable('gemini-3-flash-preview')).toBeUndefined()
  })

  it('uses discovered OpenRouter model capabilities', () => {
    expect(chatThinkingCapabilities.openRouter.disable('openai/gpt-5.2', {
      id: 'openai/gpt-5.2',
      name: 'GPT-5.2',
      provider: 'openrouter-ai',
      thinking: { canDisable: true },
    })).toEqual({ reasoning: { effort: 'none' } })

    expect(chatThinkingCapabilities.openRouter.disable('openai/o3', {
      id: 'openai/o3',
      name: 'o3',
      provider: 'openrouter-ai',
      thinking: { canDisable: false },
    })).toBeUndefined()

    expect(chatThinkingCapabilities.openRouter.disable('openrouter/auto')).toBeUndefined()
  })

  it('maps provider-native disable fields for hybrid reasoning models', () => {
    expect(chatThinkingCapabilities.deepSeek.disable('deepseek-chat')).toEqual({ thinking: { type: 'disabled' } })
    expect(chatThinkingCapabilities.zai.disable('glm-4.7')).toEqual({ thinking: { type: 'disabled' } })
    expect(chatThinkingCapabilities.moonshot.disable('kimi-k2.5')).toEqual({ thinking: { type: 'disabled' } })
    expect(chatThinkingCapabilities.mimo.disable('mimo-v2-flash')).toEqual({ thinking: { type: 'disabled' } })
  })

  it('does not send provider-native fields to unsupported model families', () => {
    expect(chatThinkingCapabilities.zai.disable('glm-4')).toBeUndefined()
    expect(chatThinkingCapabilities.moonshot.disable('moonshot-v1-128k')).toBeUndefined()
    expect(chatThinkingCapabilities.together.disable('openai/gpt-oss-120b')).toBeUndefined()
    expect(chatThinkingCapabilities.ollama.disable('gpt-oss:20b')).toBeUndefined()
    expect(chatThinkingCapabilities.groq.disable('qwen/qwen3-235b-thinking')).toBeUndefined()
    expect(chatThinkingCapabilities.groq.disable('qwen/qwen3-32b')).toBeUndefined()
    expect(chatThinkingCapabilities.aiHubMix.disable('minimax/minimax-m2.7')).toBeUndefined()
  })

  it('maps supported open-model provider controls without hiding reasoning output', () => {
    expect(chatThinkingCapabilities.aiHubMix.disable('openai/gpt-5.2')).toEqual({ reasoningEffort: 'none' })
    expect(chatThinkingCapabilities.ark.disable('byteplus/seed-2-0-pro-260328')).toEqual({ thinking: { type: 'disabled' } })
    expect(chatThinkingCapabilities.groq.disable('qwen/qwen3.6-27b')).toEqual({ reasoningEffort: 'none' })
    expect(chatThinkingCapabilities.cerebras.disable('zai-glm-4.7')).toEqual({ reasoningEffort: 'none' })
    expect(chatThinkingCapabilities.together.disable('moonshotai/Kimi-K2.5')).toEqual({ reasoning: { enabled: false } })
    expect(chatThinkingCapabilities.fireworks.disable('accounts/fireworks/models/qwen3-235b')).toEqual({ reasoningEffort: 'none' })
    expect(chatThinkingCapabilities.featherless.disable('Qwen/Qwen3-32B')).toEqual({ chatTemplateKwargs: { enable_thinking: false } })
    expect(chatThinkingCapabilities.novita.disable('zai-org/glm-4.7')).toEqual({ enableThinking: false })
    expect(chatThinkingCapabilities.nvidia.disable('qwen/qwen3.5-397b')).toEqual({ chatTemplateKwargs: { enable_thinking: false } })
    expect(chatThinkingCapabilities.ollama.disable('qwen3:8b')).toEqual({ reasoningEffort: 'none' })
  })

  it('omits Ark controls for mandatory-thinking model families', () => {
    expect(chatThinkingCapabilities.ark.disable('byteplus-coding-plan/gpt-oss-120b')).toBeUndefined()
    expect(chatThinkingCapabilities.ark.disable('volcengine-coding-plan/minimax-m3')).toBeUndefined()
  })

  it('keeps the cached provider responsive to setting changes', () => {
    let disableThinking = true
    const provider: ChatProviderWithExtraOptions<string, { seed?: number }> = {
      chat: (model, extraOptions) => ({ baseURL: 'https://example.com/v1/', model, ...extraOptions }),
    }
    const decorated = withDisabledThinking(provider, {
      enabled: () => disableThinking,
      resolve: chatThinkingCapabilities.openAI.disable,
    })

    expect(decorated.chat('gpt-5.2', { seed: 42 })).toMatchObject({ reasoningEffort: 'none', seed: 42 })

    disableThinking = false

    expect(decorated.chat('gpt-5.2')).not.toHaveProperty('reasoningEffort')
  })
})
