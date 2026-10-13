import { paraformerBilingualZhEn, SHERPAW_TRANSCRIPTION_PROVIDER_ID, xAsrBilingualZhEnInt8, zipformerMultilingual } from '@proj-airi/provider-inference'
import { describe, expect, it, vi } from 'vitest'

import { describeBiasDelivery } from './transcription-bias-delivery'

vi.mock('../providers/providers/apple-speech', () => ({ APPLE_SPEECH_TRANSCRIPTION_PROVIDER_ID: 'apple-speech-transcription' }))

describe('describeBiasDelivery', () => {
  it('sends nothing to a provider without hotwords', () => {
    expect(describeBiasDelivery({ providerId: 'openai-audio-speech', supportsHotwords: false }, ['Zustand'])).toMatchObject({ status: 'unsupported', phrases: [] })
  })

  it.each([xAsrBilingualZhEnInt8, paraformerBilingualZhEn])('reports that $id ignores the list', (sherpawModel) => {
    expect(describeBiasDelivery({ providerId: SHERPAW_TRANSCRIPTION_PROVIDER_ID, supportsHotwords: true, sherpawModel }, ['硫方怪'])).toMatchObject({ status: 'ignored', phrases: [] })
  })

  it('sends every phrase to a Zipformer', () => {
    expect(describeBiasDelivery({ providerId: SHERPAW_TRANSCRIPTION_PROVIDER_ID, supportsHotwords: true, sherpawModel: zipformerMultilingual }, ['硫方怪', 'Zustand']))
      .toMatchObject({ status: 'sent', phrases: ['硫方怪', 'Zustand'] })
  })

  it('cuts Apple contextual strings to 100', () => {
    const phrases = Array.from({ length: 120 }, (_, index) => `term-${index}`)
    const delivery = describeBiasDelivery({ providerId: 'apple-speech-transcription', supportsHotwords: true }, phrases)

    expect(delivery.phrases).toHaveLength(100)
    expect(delivery.note).toContain('20 phrases')
  })
})
