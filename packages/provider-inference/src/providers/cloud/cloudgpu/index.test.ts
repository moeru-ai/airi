import { describe, expect, it } from 'vitest'

import { getDefinedProvider } from '../../../index'
import { CLOUDGPU_DEFAULT_BASE_URL, providerCloudgpu, toCloudgpuChatModels } from './index'

describe('cloudgpu provider', () => {
  it('is registered with the CloudGPU endpoint as default', () => {
    expect(getDefinedProvider('cloudgpu')).toBe(providerCloudgpu)
    expect(CLOUDGPU_DEFAULT_BASE_URL).toBe('https://cloudgpu.app/v1/')
  })

  it('keeps only chat models from the mixed model list', () => {
    const models = toCloudgpuChatModels([
      { id: 'flux-1-schnell' },
      { id: 'text-embedding-3' },
      { id: 'bge-reranker-v2' },
      { id: 'kokoro-tts' },
      { id: 'whisper-v3' },
      { id: 'asr-v3' },
      { id: 'studio-speech' },
      { id: 'clip-audio' },
      { id: 'photo-image' },
      { id: 'meeting-transcription' },
      { id: 'deepseek-v4.1-flash' },
      { id: 'glm-5.1' },
      { id: 'auto', name: 'Auto' },
    ])

    expect(models).toEqual([
      {
        id: 'deepseek-v4.1-flash',
        name: 'deepseek-v4.1-flash',
        provider: 'cloudgpu',
      },
      {
        id: 'glm-5.1',
        name: 'glm-5.1',
        provider: 'cloudgpu',
      },
      {
        id: 'auto',
        name: 'Auto',
        provider: 'cloudgpu',
      },
    ])
  })
})
