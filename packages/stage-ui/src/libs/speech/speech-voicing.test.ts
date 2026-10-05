import { describe, expect, it, vi } from 'vitest'

import { SpeechVoicingTracker } from './speech-voicing'

function setUp() {
  const onChange = vi.fn()
  return { tracker: new SpeechVoicingTracker(onChange), onChange }
}

describe('speechVoicingTracker', () => {
  it('voices a segmenter intent from its first audio until the pipeline closes it', () => {
    const { tracker, onChange } = setUp()
    tracker.openIntent('intent-1')
    expect(onChange).not.toHaveBeenCalled()

    tracker.audioStarted('intent-1')
    tracker.audioSettled('intent-1')
    tracker.audioStarted('intent-1')
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenLastCalledWith(true)

    tracker.closeIntent('intent-1')
    expect(onChange).toHaveBeenLastCalledWith(false)
  })

  // ROOT CAUSE:
  //
  // Official streaming TTS schedules audio straight into playback, so it
  // opened no pipeline intent, and a spoken reply never counted as voiced.
  //
  // We fixed this by opening a streaming intent with its first scheduled audio.
  it('voices a streaming session until it is done and its audio has settled', () => {
    const { tracker, onChange } = setUp()
    tracker.streamingAudioScheduled('stream-1')
    tracker.streamingAudioScheduled('stream-1')
    tracker.audioStarted('stream-1')
    expect(onChange).toHaveBeenLastCalledWith(true)

    tracker.audioSettled('stream-1')
    tracker.streamingInputDone('stream-1')
    expect(onChange).toHaveBeenCalledTimes(1)

    tracker.audioSettled('stream-1')
    expect(onChange).toHaveBeenLastCalledWith(false)
  })

  it('ends a canceled streaming session at once, even with queued audio', () => {
    const { tracker, onChange } = setUp()
    tracker.streamingAudioScheduled('stream-1')
    tracker.streamingAudioScheduled('stream-1')
    tracker.audioStarted('stream-1')

    tracker.closeIntent('stream-1')
    expect(onChange).toHaveBeenLastCalledWith(false)
  })

  it('stays voicing while another intent is still open', () => {
    const { tracker, onChange } = setUp()
    tracker.openIntent('intent-1')
    tracker.streamingAudioScheduled('stream-1')
    tracker.audioStarted('intent-1')

    tracker.closeIntent('intent-1')
    expect(onChange).toHaveBeenCalledTimes(1)

    tracker.closeIntent('stream-1')
    expect(onChange).toHaveBeenLastCalledWith(false)
  })

  it('ignores audio from no open intent', () => {
    const { tracker, onChange } = setUp()
    tracker.audioStarted('special-token')

    expect(onChange).not.toHaveBeenCalled()
  })
})
