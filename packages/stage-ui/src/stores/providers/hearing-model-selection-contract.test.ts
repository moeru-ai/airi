import { describe, expect, it } from 'vitest'

import { allowsManualModelInput } from '../../../../stage-pages/src/pages/settings/modules/hearing-model-selection'

describe('hearing model selection', () => {
  it('allows a bypassed FunASR instance with an empty failed catalog to accept a manual model', () => {
    expect(allowsManualModelInput({
      supportsModelListing: true,
      modelCount: 0,
      isLoading: false,
      provider: { definitionId: 'funasr-audio-transcription', status: 'bypassed' },
    })).toBe(true)
  })

  it('allows a bypassed FunASR instance to ignore models cached from old credentials', () => {
    expect(allowsManualModelInput({
      supportsModelListing: true,
      modelCount: 1,
      isLoading: false,
      provider: { definitionId: 'funasr-audio-transcription', status: 'bypassed' },
    })).toBe(true)
  })

  it('does not expose manual input for a configured FunASR instance with a failed catalog', () => {
    expect(allowsManualModelInput({
      supportsModelListing: true,
      modelCount: 0,
      isLoading: false,
      provider: { definitionId: 'funasr-audio-transcription', status: 'configured' },
    })).toBe(false)
  })
})
