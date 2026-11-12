import { describe, expect, it } from '../../src'
import { audioCaseLive2D, configureLive2D, configureOnboarding, configureWakeWord } from '../shared/configurations'
import { readSessionCharacterId } from '../shared/interactions'

const silentCardId = 'testing-audio-wake-word-light-up'
const spokenCardId = 'testing-audio-wake-word-hello-computer'

describe('wake word routing', () => {
  // One detector has the wake words of two characters. The recording says only "Hello computer" three times.
  // It starts with 15 seconds of silence while the application loads the KWS model.
  it('begins the voice input in the session of the character whose wake word was said', {
    input: new URL('./input.test.wav', import.meta.url),
    pipelines: ['kws'],
    preflight: [
      configureOnboarding(() => ({ completed: true })),
      configureLive2D(() => audioCaseLive2D),
      configureWakeWord(() => [
        { targetCardId: silentCardId, text: 'Light up', pronunciations: [['L', 'AY1', 'T', 'AH1', 'P']] },
        { targetCardId: spokenCardId, text: 'Hello computer', pronunciations: [['HH', 'AH0', 'L', 'OW1', 'K', 'AH0', 'M', 'P', 'Y', 'UW1', 'T', 'ER0']] },
      ]),
    ],
  }, async ({ audio }) => {
    // In wake word mode, speech alone begins no input. So the first voice input comes from a wake.
    const input = await audio.waitForVoiceInput({ timeout: 90_000 })

    await expect(readSessionCharacterId(audio, input.sessionId)).resolves.toBe(spokenCardId)
    // A wake routes the input to the character session. It does not select either character.
    const activeCardId = await audio.runtimePage.evaluate(() => localStorage.getItem('airi-card-active-id'))
    expect([silentCardId, spokenCardId]).not.toContain(activeCardId)
  })
})
