import { describe, expect, it } from 'vitest'

import { providerOfficialSpeech } from './index'

describe('official speech provider', () => {
  /**
   * @example
   * provider.speech('microsoft/v1', { speed: 1.2 })
   */
  it('keeps speech extra options on the generated request config', () => {
    const provider = providerOfficialSpeech.createProvider({})

    const request = provider.speech('microsoft/v1', { speed: 1.2 })

    expect(request.model).toBe('microsoft/v1')
    expect(request.speed).toBe(1.2)
    expect(request.fetch).toBeTypeOf('function')
  })
})
