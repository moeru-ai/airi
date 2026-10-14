import type { AudioWindow, PcmBlock } from '@proj-airi/pipelines-audio'

import { AudioInput, createPushStream } from '@proj-airi/pipelines-audio'
import { describe, expect, it, vi } from 'vitest'

import { VoiceEnrollment } from './voice-enrollment'

const SAMPLE_RATE = 16000
/** One Silero VAD window: 32 ms at 16 kHz. */
const WINDOW = 512
/** The fake microphone writes this sample value for speech. The fake VAD scores it as speech. */
const SPEECH = 0.5

/** A microphone that the test feeds window by window, and a VAD that scores loud windows as speech. */
function createHarness(enroll = vi.fn(async (_speech: Float32Array, _sampleRate: number, _signal: AbortSignal) => {})) {
  const source = createPushStream<PcmBlock>()
  let frame = 0
  const detect = vi.fn(async (window: AudioWindow): Promise<number> => Math.abs(window.channels[0]![0]!) > 0.1 ? 0.9 : 0.01)
  const enrollment = new VoiceEnrollment(new AudioInput({ live: true, open: () => source.stream }), { detect, enroll })

  /** Writes `windows` windows of speech or silence. */
  function write(windows: number, value: number) {
    for (let index = 0; index < windows; index++) {
      source.write({ range: { sourceId: 'mic', startFrame: frame, endFrame: frame + WINDOW }, sampleRate: SAMPLE_RATE, channels: [new Float32Array(WINDOW).fill(value)] })
      frame += WINDOW
    }
  }

  return { enrollment, enroll, detect, write }
}

describe('voiceEnrollment', () => {
  it('enrolls only the speech windows of the recording', async () => {
    const { enrollment, enroll, write } = createHarness()

    write(25, 0)
    write(100, SPEECH)
    write(25, 0)
    write(100, SPEECH)
    await expect.poll(() => enrollment.snapshot.speechSeconds).toBe(6.4)
    enrollment.finish()
    await enrollment.done

    expect(enrollment.snapshot.phase).toBe('enrolled')
    expect(enroll).toHaveBeenCalledTimes(1)
    const [speech, sampleRate] = enroll.mock.calls[0]!
    expect(sampleRate).toBe(SAMPLE_RATE)
    expect(speech.length).toBe(200 * WINDOW)
    expect(speech.every(sample => sample === SPEECH)).toBe(true)
  })

  it('fails without enrolling when the recording has less than 5 s of speech', async () => {
    const { enrollment, enroll, write } = createHarness()

    write(100, SPEECH)
    await expect.poll(() => enrollment.snapshot.speechSeconds).toBe(3.2)
    enrollment.finish()
    await enrollment.done

    expect(enrollment.snapshot.phase).toBe('failed')
    expect(enrollment.snapshot.failure).toBe('too-short')
    expect(enroll).not.toHaveBeenCalled()
  })

  it('stops recording by itself after 30 s of audio', async () => {
    const { enrollment, enroll, write } = createHarness()

    write(950, SPEECH)
    await enrollment.done

    expect(enrollment.snapshot.phase).toBe('enrolled')
    // The window that reaches 30 s is the last one.
    expect(enroll.mock.calls[0]![0].length).toBe(Math.ceil(30 * SAMPLE_RATE / WINDOW) * WINDOW)
  })

  it('aborts the voiceprint computation on cancel and reports cancelled', async () => {
    const computing = Promise.withResolvers<void>()
    const { enrollment, enroll, write } = createHarness(vi.fn(async () => computing.promise))

    write(200, SPEECH)
    await expect.poll(() => enrollment.snapshot.speechSeconds).toBe(6.4)
    enrollment.finish()
    await expect.poll(() => enrollment.snapshot.phase).toBe('enrolling')
    enrollment.cancel()
    computing.resolve()
    await enrollment.done

    expect(enrollment.snapshot.phase).toBe('cancelled')
    expect(enroll.mock.calls[0]![2].aborted).toBe(true)
  })

  it('stays cancelled and does not enroll when a cancel follows finish', async () => {
    const { enrollment, enroll, write } = createHarness()

    write(200, SPEECH)
    await expect.poll(() => enrollment.snapshot.speechSeconds).toBe(6.4)
    // The finished capture no longer follows the abort, so the reader still sees the end of the recording.
    enrollment.finish()
    enrollment.cancel()
    await enrollment.done

    expect(enrollment.snapshot.phase).toBe('cancelled')
    expect(enroll).not.toHaveBeenCalled()
  })

  it('stays cancelled when a VAD score resolves after cancel', async () => {
    const { enrollment, detect, write } = createHarness()
    const scoring = Promise.withResolvers<number>()

    // Three windows hold 0.096 s of speech. The fourth window reaches 0.1 s, so its score changes the snapshot.
    write(3, SPEECH)
    await expect.poll(() => detect.mock.calls.length).toBe(3)
    detect.mockImplementationOnce(async () => scoring.promise)
    write(1, SPEECH)
    await expect.poll(() => detect.mock.calls.length).toBe(4)
    enrollment.cancel()
    scoring.resolve(0.9)
    await enrollment.done

    expect(enrollment.snapshot.phase).toBe('cancelled')
  })

  it('reports the error of a failed voiceprint computation', async () => {
    const { enrollment, write } = createHarness(vi.fn(async () => {
      throw new Error('Audio has more than one voice')
    }))

    write(200, SPEECH)
    await expect.poll(() => enrollment.snapshot.speechSeconds).toBe(6.4)
    enrollment.finish()
    await enrollment.done

    expect(enrollment.snapshot.phase).toBe('failed')
    expect(enrollment.snapshot.failure).toBe('error')
    expect(enrollment.snapshot.error).toBe('Audio has more than one voice')
  })
})
