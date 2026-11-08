import { describe, expect, it } from 'vitest'

import { getDefinedProvider } from '../../../index'
import { providerRuncrate, toRuncrateChatModels } from './index'

describe('runcrate provider', () => {
  it('is registered with the Runcrate endpoint as default', () => {
    expect(getDefinedProvider('runcrate')).toBe(providerRuncrate)
  })

  it('keeps only chat models from the mixed model list', () => {
    const models = toRuncrateChatModels([
      { id: 'black-forest-labs/FLUX.1-kontext-max', output_modalities: ['image'], context_length: 0 },
      { id: 'BAAI/bge-m3', output_modalities: ['embeddings'], context_length: 8192 },
      { id: 'openai/whisper-large-v3', input_modalities: ['audio'], output_modalities: ['text'], context_length: 0 },
      { id: 'deepseek-ai/DeepSeek-V4.1-Flash', name: 'DeepSeek V4.1 Flash', input_modalities: ['text', 'image'], output_modalities: ['text'], context_length: 1048576 },
      { id: 'zai-org/GLM-5', input_modalities: ['text'], output_modalities: ['text'], context_length: 202752 },
    ])

    expect(models).toEqual([
      {
        id: 'deepseek-ai/DeepSeek-V4.1-Flash',
        name: 'DeepSeek V4.1 Flash',
        provider: 'runcrate',
        inputModalities: ['text', 'image'],
        contextLength: 1048576,
        metadata: { abilities: { vision: true } },
      },
      {
        id: 'zai-org/GLM-5',
        name: 'zai-org/GLM-5',
        provider: 'runcrate',
        inputModalities: ['text'],
        contextLength: 202752,
      },
    ])
  })
})
