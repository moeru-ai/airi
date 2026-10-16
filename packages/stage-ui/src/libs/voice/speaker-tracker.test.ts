import type { SpeakerTracker, SpeakerVoiceprint } from '@sherpaw/speaker-diarization'

import { describe, expect, it, vi } from 'vitest'

import { SpeakerTrackerRuntime } from './speaker-tracker'

function voiceprint(value: number): SpeakerVoiceprint {
  return { embedding: new Float32Array([value, 0, 0]), seconds: 10 }
}

/** A tracker Worker that records the calls of the runtime. Calls that the runtime must not make reject. */
function createTracker() {
  const unused = () => Promise.reject(new Error('The runtime must not call this'))
  return {
    segmentation: false,
    track: unused,
    peek: unused,
    enroll: unused,
    voiceprint: unused,
    inspect: unused,
    speech: unused,
    similarity: unused,
    reset: vi.fn<SpeakerTracker['reset']>(async () => {}),
    enrollVoiceprint: vi.fn<SpeakerTracker['enrollVoiceprint']>(async () => 0),
    dispose: vi.fn<SpeakerTracker['dispose']>(),
  } satisfies SpeakerTracker
}

function createHarness(createTrackerImpl?: (signal: AbortSignal) => Promise<SpeakerTracker>) {
  const tracker = createTracker()
  const create = vi.fn(createTrackerImpl ?? (async (_signal: AbortSignal) => tracker))
  const onPreparationChange = vi.fn()
  const runtime = new SpeakerTrackerRuntime({ createTracker: create, onPreparationChange })
  return { tracker, create, onPreparationChange, runtime }
}

describe('speakerTrackerRuntime', () => {
  it('loads one tracker for concurrent callers and enrolls the voiceprints in order', async () => {
    const { tracker, create, onPreparationChange, runtime } = createHarness()
    const first = voiceprint(1)
    const second = voiceprint(2)

    await runtime.setVoiceprints([first, second])

    expect(create).not.toHaveBeenCalled()

    const [a, b] = await Promise.all([runtime.acquire(), runtime.acquire()])

    expect(a).toBe(tracker)
    expect(b).toBe(tracker)
    expect(create).toHaveBeenCalledTimes(1)
    expect(tracker.reset).toHaveBeenCalledWith({ forgetEnrolled: true })
    expect(tracker.enrollVoiceprint.mock.calls).toEqual([[first], [second]])
    expect(onPreparationChange.mock.calls).toEqual([['preparing'], ['ready']])
  })

  it('forgets the enrolled speakers before it enrolls new voiceprints in a loaded tracker', async () => {
    const { tracker, runtime } = createHarness()
    await runtime.setVoiceprints([voiceprint(1)])
    await runtime.acquire()
    tracker.reset.mockClear()
    tracker.enrollVoiceprint.mockClear()
    const replacement = voiceprint(3)

    await runtime.setVoiceprints([replacement])

    expect(tracker.reset).toHaveBeenCalledWith({ forgetEnrolled: true })
    expect(tracker.enrollVoiceprint.mock.calls).toEqual([[replacement]])
    expect(tracker.reset.mock.invocationCallOrder[0]).toBeLessThan(tracker.enrollVoiceprint.mock.invocationCallOrder[0]!)
  })

  it('returns a loaded tracker only after it enrolls a replaced voiceprint', async () => {
    const { tracker, runtime } = createHarness()
    await runtime.setVoiceprints([voiceprint(1)])
    await runtime.acquire()
    const enrolling = Promise.withResolvers<number>()
    tracker.enrollVoiceprint.mockImplementationOnce(async () => enrolling.promise)
    let acquired = false

    const replaced = runtime.setVoiceprints([voiceprint(3)])
    const acquire = runtime.acquire().then(() => acquired = true)
    await vi.waitFor(() => expect(tracker.enrollVoiceprint).toHaveBeenCalledTimes(2))

    // The tracker forgot speaker 0 and has not enrolled the new voiceprint yet, so a comparison now fails.
    expect(acquired).toBe(false)

    enrolling.resolve(0)
    await Promise.all([replaced, acquire])

    expect(acquired).toBe(true)
  })

  it('reports a failed load and loads again on the next acquire', async () => {
    const { tracker, create, onPreparationChange, runtime } = createHarness()
    create.mockRejectedValueOnce(new Error('Could not download the voiceprint model (404, 404)'))

    await expect(runtime.acquire()).rejects.toThrow('Could not download the voiceprint model (404, 404)')

    expect(onPreparationChange).toHaveBeenLastCalledWith('error', 'Could not download the voiceprint model (404, 404)')

    await expect(runtime.acquire()).resolves.toBe(tracker)

    expect(create).toHaveBeenCalledTimes(2)
    expect(onPreparationChange).toHaveBeenLastCalledWith('ready')
  })

  it('terminates the tracker when a voiceprint does not enroll', async () => {
    const { tracker, onPreparationChange, runtime } = createHarness()
    tracker.enrollVoiceprint.mockRejectedValueOnce(new Error('Voiceprint length 3 does not match the model length 192'))
    await runtime.setVoiceprints([voiceprint(1)])

    await expect(runtime.acquire()).rejects.toThrow('Voiceprint length 3 does not match the model length 192')

    expect(tracker.dispose).toHaveBeenCalled()
    expect(onPreparationChange).toHaveBeenLastCalledWith('error', 'Voiceprint length 3 does not match the model length 192')
  })

  it('terminates a tracker that finishes loading after dispose', async () => {
    const tracker = createTracker()
    let finishLoad!: () => void
    let signal!: AbortSignal
    const { onPreparationChange, runtime } = createHarness(async (loadSignal) => {
      signal = loadSignal
      await new Promise<void>(resolve => finishLoad = resolve)
      return tracker
    })
    const acquired = runtime.acquire()

    runtime.dispose()

    expect(signal.aborted).toBe(true)
    expect(onPreparationChange).toHaveBeenLastCalledWith('idle')

    finishLoad()

    await expect(acquired).rejects.toThrow()

    expect(tracker.dispose).toHaveBeenCalled()
    expect(onPreparationChange).not.toHaveBeenCalledWith('error', expect.anything())
  })

  it('terminates a loaded tracker on dispose and loads a new one on the next acquire', async () => {
    const { tracker, create, onPreparationChange, runtime } = createHarness()
    await runtime.acquire()

    runtime.dispose()

    expect(onPreparationChange).toHaveBeenLastCalledWith('idle')

    await vi.waitFor(() => expect(tracker.dispose).toHaveBeenCalledTimes(1))
    await runtime.acquire()

    expect(create).toHaveBeenCalledTimes(2)
  })
})
