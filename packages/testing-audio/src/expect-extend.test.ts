import type { SerializedIOSpan } from '@proj-airi/stage-shared/types/io-trace'

import type { AudioInputObservations } from './types'

import { IOAttributes, IOSpanNames } from '@proj-airi/stage-shared/perf/io-trace'
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
    const session = createAudioInputSession([], [recognitionSpan({ status: { code: 2, message: 'Request failed' } })])

    await expect(expect(session).toHaveCompletedTranscription()).rejects.toThrow('ASR failed: Request failed')
  })

  it('ignores an aborted request and completes with the next recognition span', async () => {
    const session = createAudioInputSession([], [
      recognitionSpan({ attributes: { [IOAttributes.ASRAbort]: true } }),
      recognitionSpan({ attributes: { [IOAttributes.ASRText]: 'Please say hello.' } }),
    ])

    await expect(session).toHaveCompletedTranscription()
  })
})

function createAudioInputSession(
  transcriptions: string[],
  spans: SerializedIOSpan[] = [],
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
    waitForVadReady: async () => {},
  }
}

function recognitionSpan(overrides: Partial<SerializedIOSpan>): SerializedIOSpan {
  return {
    attributes: {},
    ended: true,
    endTimeNano: '1',
    events: [],
    kind: 0,
    name: IOSpanNames.SpeechRecognition,
    parentSpanId: '',
    spanId: 'recognition',
    startTimeNano: '0',
    status: { code: 0, message: '' },
    traceId: 'trace',
    ...overrides,
  }
}
