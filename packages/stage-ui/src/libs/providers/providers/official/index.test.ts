import type { SpeechProviderWithExtraOptions } from '@xsai-ext/providers/utils'

import { describe, expect, it } from 'vitest'

import { providerOfficialSpeech } from './index'

interface OfficialSpeechOptions {
  speed?: number
  extraBody?: {
    voice_pack?: {
      pitch?: number
    }
  }
}

describe('official speech provider', () => {
  /**
   * @example
   * provider.speech('microsoft/v1', { speed: 1.2 })
   */
  it('keeps speech extra options on the generated request config', () => {
    const provider = providerOfficialSpeech.createProvider({}) as SpeechProviderWithExtraOptions<string, OfficialSpeechOptions>

    const request = provider.speech('microsoft/v1', {
      speed: 1.2,
      extraBody: {
        voice_pack: {
          pitch: 20,
        },
      },
    })

    expect(request.model).toBe('microsoft/v1')
    expect(request.speed).toBe(1.2)
    expect(request.extraBody).toEqual({
      voice_pack: {
        pitch: 20,
      },
    })
    expect(request.fetch).toBeTypeOf('function')
  })
})
