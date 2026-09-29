import { describe, expect, it } from 'vitest'

import {
  assistantSpeechCooldownDeadline,
  DEFAULT_ASSISTANT_SPEECH_INPUT_COOLDOWN_MS,
  shouldSuppressVoiceInput,
} from './voice-input-suppression'

describe('shouldSuppressVoiceInput', () => {
  it('suppresses voice input while assistant speech is active', () => {
    const result = shouldSuppressVoiceInput({
      assistantSpeaking: true,
      suppressedUntil: 0,
      manualRecordingActive: false,
    }, 1000)

    expect(result).toBe(true)
  })

  it('suppresses voice input during the assistant speech cooldown', () => {
    const result = shouldSuppressVoiceInput({
      assistantSpeaking: false,
      suppressedUntil: 1800,
      manualRecordingActive: false,
    }, 1200)

    expect(result).toBe(true)
  })

  it('allows voice input after assistant speech cooldown ends', () => {
    const result = shouldSuppressVoiceInput({
      assistantSpeaking: false,
      suppressedUntil: 1800,
      manualRecordingActive: false,
    }, 1800)

    expect(result).toBe(false)
  })

  it('suppresses ambient voice input during manual recording', () => {
    expect(shouldSuppressVoiceInput({
      assistantSpeaking: false,
      suppressedUntil: 0,
      manualRecordingActive: true,
    }, 1000)).toBe(true)
  })
})

describe('assistantSpeechCooldownDeadline', () => {
  it('returns the default cooldown deadline after assistant speech ends', () => {
    const result = assistantSpeechCooldownDeadline(1000)

    expect(result).toBe(1000 + DEFAULT_ASSISTANT_SPEECH_INPUT_COOLDOWN_MS)
  })
})
