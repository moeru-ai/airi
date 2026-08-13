import type { AudioInputObservations } from './types'

import { describe, it } from 'vitest'

import { expect, installAudioInputMatchers } from './expect-extend'

installAudioInputMatchers()

describe('audio input matchers', () => {
  it('normalizes transcription case, width, punctuation, and whitespace', async () => {
    const session = createAudioInputSession(['Ｐlease, SAY hello!'])

    await expect(session).toHaveTranscriptions([
      ['please say hello'],
    ])
  })
})

function createAudioInputSession(transcriptions: string[]): AudioInputObservations {
  return {
    capturedTranscriptionAudio: async () => [],
    streamingTranscriptionUpdates: async () => [],
    transcriptionResults: async () => transcriptions,
    completedSpans: async () => [],
    waitForStreamingTranscriptionReady: async () => {},
    waitForVadReady: async () => {},
  }
}
