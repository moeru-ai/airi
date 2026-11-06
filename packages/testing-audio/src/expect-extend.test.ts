import type { AudioInputObservations, AudioInputSpan } from './types'

import { VoiceAttributes, VoiceNames } from '@proj-airi/trace-kit/voice'
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

  it('reports a failed speech recognition span', async () => {
    const session = createAudioInputSession([], [recognitionSpan({ status: 'error', message: 'Request failed' })])

    await expect(expect(session).toHaveCompletedTranscription()).rejects.toThrow('ASR failed: Request failed')
  })

  it('ignores an aborted request and completes with the next recognition span', async () => {
    const session = createAudioInputSession([], [
      recognitionSpan({ status: 'cancelled' }),
      recognitionSpan({ attrs: { [VoiceAttributes.ASRText]: 'Please say hello.' } }),
    ])

    await expect(session).toHaveCompletedTranscription()
  })
})

function createAudioInputSession(
  transcriptions: string[],
  spans: AudioInputSpan[] = [],
): AudioInputObservations {
  return {
    capturedTranscriptionAudio: async () => [],
    streamingTranscriptionUpdates: async () => [],
    transcriptionResults: async () => transcriptions,
    completedSpans: async name => spans.filter(span => !name || span.name === name),
    piniaActionEvents: async () => [],
    waitForPiniaAction: async () => {
      throw new Error('This matcher fixture does not observe Pinia actions.')
    },
    waitForStreamingTranscriptionReady: async () => {},
    waitForTurn: async () => {
      throw new Error('This matcher fixture does not observe completed turns.')
    },
    waitForVoiceInput: async () => {
      throw new Error('This matcher fixture does not observe voice inputs.')
    },
  }
}

function recognitionSpan(overrides: Partial<AudioInputSpan>): AudioInputSpan {
  return {
    spanId: 'recognition',
    name: VoiceNames.SpeechRecognition,
    track: 'participants/user/asr',
    ids: {},
    attrs: {},
    start: 0,
    end: 1,
    status: 'ok',
    ...overrides,
  }
}
