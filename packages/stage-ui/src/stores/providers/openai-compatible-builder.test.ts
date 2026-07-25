import { describe, expect, it } from 'vitest'

import { buildOpenAICompatibleProvider } from './openai-compatible-builder'

describe('buildOpenAICompatibleProvider', () => {
  /**
   * @example
   * provider.transcription('FunAudioLLM/SenseVoiceSmall', { language: 'zh' })
   */
  it('preserves transcription extra options for OpenAI-compatible ASR providers', async () => {
    const metadata = buildOpenAICompatibleProvider({
      id: 'test-openai-compatible-transcription',
      name: 'Test Transcription',
      nameKey: 'test.transcription.title',
      description: 'Test transcription provider',
      descriptionKey: 'test.transcription.description',
      icon: 'i-lobe-icons:openai',
      category: 'transcription',
      creator: () => ({
        transcription: (model: string) => ({
          baseURL: 'https://example.com/v1/',
          model,
        }),
      }),
    })

    const provider = await metadata.createProvider({})

    expect('transcription' in provider).toBe(true)
    expect((provider as any).transcription('FunAudioLLM/SenseVoiceSmall', { language: 'zh' })).toEqual({
      baseURL: 'https://example.com/v1/',
      language: 'zh',
      model: 'FunAudioLLM/SenseVoiceSmall',
    })
  })
})
