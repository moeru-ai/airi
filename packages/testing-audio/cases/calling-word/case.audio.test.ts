import { describe, expect, it } from '../../src'
import { configureCallingWord, configureOnboarding } from '../shared/configurations'

const targetCardId = 'testing-audio-calling-word'

describe('calling word detection', () => {
  // The recording starts with silence while the application loads the KWS model.
  // The spoken phrase repeats three times to exercise the real microphone and Worker path.
  it('activates the character after the calling word', {
    input: new URL('./input.test.wav', import.meta.url),
    pipelines: ['kws'],
    preflight: [
      configureOnboarding(() => ({ completed: true })),
      configureCallingWord(() => ({ targetCardId, label: 'Light up', tokens: ['L', 'AY1', 'T', 'AH1', 'P'] })),
    ],
  }, async ({ audio }) => {
    await audio.runtimePage.waitForFunction(
      cardId => localStorage.getItem('airi-card-active-id') === cardId,
      targetCardId,
      { timeout: 90_000 },
    )
    const activeCardId = await audio.runtimePage.evaluate(() => localStorage.getItem('airi-card-active-id'))
    expect(activeCardId).toBe(targetCardId)
  })
})
