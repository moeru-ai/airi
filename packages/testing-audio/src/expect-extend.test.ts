import type { PiniaActionEvent } from '@proj-airi/stage-shared/types/pinia-action-event'

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

  it('reports a failed transcription action', async () => {
    const session = createAudioInputSession([], [{
      ...actionEvent('modules:hearing:speech:audio-input-pipeline', 'transcribeForRecording'),
      errorMessage: 'Request failed',
      status: 'failed',
    }])

    await expect(expect(session).toHaveCompletedTranscription()).rejects.toThrow('ASR failed: Request failed')
  })
})

function createAudioInputSession(
  transcriptions: string[],
  actions: PiniaActionEvent[] = [],
): AudioInputObservations {
  return {
    capturedTranscriptionAudio: async () => [],
    streamingTranscriptionUpdates: async () => [],
    transcriptionResults: async () => transcriptions,
    completedSpans: async () => [],
    piniaActionEvents: async () => actions,
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

function actionEvent(storeId: string, actionName: string): PiniaActionEvent {
  return {
    actionName,
    invocationId: `${storeId}:${actionName}`,
    status: 'completed',
    storeId,
    timestamp: 0,
  }
}
