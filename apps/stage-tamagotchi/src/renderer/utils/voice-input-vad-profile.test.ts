import { describe, expect, it } from 'vitest'

import {
  getVoiceInputVadProfile,
  readVoiceInputVadProfileName,
  voiceInputVadProfileStorageKey,
} from './voice-input-vad-profile'

describe('getVoiceInputVadProfile', () => {
  it('uses the balanced preset when no valid profile is configured', () => {
    expect(getVoiceInputVadProfile().name).toBe('balanced')
    expect(getVoiceInputVadProfile('unknown').name).toBe('balanced')
  })

  it('returns the long sentence preset with wider padding and silence windows', () => {
    const balanced = getVoiceInputVadProfile('balanced')
    const longSentence = getVoiceInputVadProfile('long-sentence')
    const balancedMinPeak = balanced.segmentQualityGate.minPeak
    const longSentenceMinPeak = longSentence.segmentQualityGate.minPeak

    if (balancedMinPeak == null || longSentenceMinPeak == null)
      throw new Error('Expected profile fixtures to include minPeak gates')

    expect(longSentence.name).toBe('long-sentence')
    expect(longSentence.vad.minSilenceDurationMs).toBeGreaterThan(balanced.vad.minSilenceDurationMs)
    expect(longSentence.vad.speechPadMs).toBeGreaterThan(balanced.vad.speechPadMs)
    expect(longSentenceMinPeak).toBeLessThan(balancedMinPeak)
  })
})

describe('readVoiceInputVadProfileName', () => {
  it('reads a valid profile name from the provided storage boundary', () => {
    const storage = {
      getItem(key: string) {
        return key === voiceInputVadProfileStorageKey ? 'sensitive' : null
      },
    }

    expect(readVoiceInputVadProfileName(storage)).toBe('sensitive')
  })

  it('ignores invalid storage values', () => {
    const storage = {
      getItem() {
        return 'very-noisy'
      },
    }

    expect(readVoiceInputVadProfileName(storage)).toBeUndefined()
  })
})
