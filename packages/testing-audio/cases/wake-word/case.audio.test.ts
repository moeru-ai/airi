import { describe, expect, it } from '../../src'
import { configureOnboarding, configureWakeWord } from '../shared/configurations'
import { readSessionCharacterId } from '../shared/interactions'

const targetCardId = 'testing-audio-wake-word'

describe('wake word detection', () => {
  // The recording starts with 35 seconds of silence while the application loads the KWS model.
  // The spoken phrase repeats three times to exercise the real microphone and Worker path.
  it('begins a voice input in the session of the character that owns the wake word', {
    input: new URL('./input.test.wav', import.meta.url),
    pipelines: ['kws'],
    preflight: [
      configureOnboarding(() => ({ completed: true })),
      configureWakeWord(() => ({ targetCardId, text: 'Light up', tokens: ['L', 'AY1', 'T', 'AH1', 'P'] })),
    ],
  }, async ({ audio }) => {
    // In wake word mode, speech alone begins no input. So the first voice input comes from a wake.
    const input = await audio.waitForVoiceInput({ timeout: 90_000 })

    await expect(readSessionCharacterId(audio, input.sessionId)).resolves.toBe(targetCardId)
    // A wake routes the input to the character session. It does not select the character.
    await expect(audio.runtimePage.evaluate(() => localStorage.getItem('airi-card-active-id'))).resolves.not.toBe(targetCardId)
  })
})
