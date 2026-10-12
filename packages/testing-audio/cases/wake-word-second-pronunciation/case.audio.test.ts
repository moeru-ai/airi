import { describe, expect, it } from '../../src'
import { configureOnboarding, configureWakeWord } from '../shared/configurations'
import { readSessionCharacterId } from '../shared/interactions'

const targetCardId = 'testing-audio-wake-word-open-sesame'

describe('wake word pronunciations', () => {
  // The wake word has an English and a Mandarin pronunciation. The recording says only the Mandarin one, "芝麻开门", three times.
  // It starts with 15 seconds of silence while the application loads the KWS model.
  it('wakes the character with a later pronunciation in another language', {
    input: new URL('./input.test.wav', import.meta.url),
    pipelines: ['kws'],
    preflight: [
      configureOnboarding(() => ({ completed: true })),
      configureWakeWord(() => [{
        targetCardId,
        text: 'Open sesame',
        pronunciations: [
          ['OW1', 'P', 'AH0', 'N', 'S', 'EH1', 'S', 'AH0', 'M', 'IY0'],
          // Mandarin tokens of the zh/en model are pinyin initials and finals with tone marks: zhī ma kāi mén.
          ['zh', 'ī', 'm', 'a', 'k', 'āi', 'm', 'én'],
        ],
      }]),
    ],
  }, async ({ audio }) => {
    // In wake word mode, speech alone begins no input. So the first voice input comes from a wake.
    const input = await audio.waitForVoiceInput({ timeout: 90_000 })

    await expect(readSessionCharacterId(audio, input.sessionId)).resolves.toBe(targetCardId)
  })
})
