import type { SpeakerTracker } from '@sherpaw/speaker-diarization'

import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

import { useSpeakerTrackerStore } from './speaker-tracker'
import { useVoiceprintStore } from './voiceprint'

/** A tracker Worker that scores every comparison 0.42. Calls that the store must not make reject. */
const tracker = vi.hoisted(() => {
  const unused = () => Promise.reject(new Error('The store must not call this'))
  return {
    segmentation: false,
    track: unused,
    peek: unused,
    enroll: unused,
    voiceprint: unused,
    inspect: unused,
    speech: unused,
    similarity: vi.fn(async (_samples: Float32Array, _sampleRate: number, _speaker: number) => new Float32Array([0.42])),
    reset: vi.fn(async () => {}),
    enrollVoiceprint: vi.fn(async () => 0),
    dispose: vi.fn(),
  }
})

// The real loader downloads the 28 MB CAM++ pack and starts a WebAssembly Worker. The test replaces that model boundary.
const loadSpeakerTracker = vi.hoisted(() => vi.fn(async (): Promise<SpeakerTracker> => tracker satisfies SpeakerTracker))
vi.mock('../libs/voice/speaker-model', () => ({ loadSpeakerTracker }))

afterEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
})

/** A 16 kHz mono window. */
function audioWindow(channel: Float32Array) {
  return { sampleRate: 16000, channels: [channel] }
}

function createStores() {
  const pinia = createPinia()
  setActivePinia(pinia)
  return { trackers: useSpeakerTrackerStore(), voiceprints: useVoiceprintStore(), dispose: () => disposePinia(pinia) }
}

describe('speaker tracker store', () => {
  it('compares the window with each enabled voiceprint as one window, in the saved order', async () => {
    const { trackers, voiceprints, dispose } = createStores()
    const first = voiceprints.add({ embedding: new Float32Array([1, 0]), seconds: 8 }, Date.now() + 1)!
    const second = voiceprints.add({ embedding: new Float32Array([0, 1]), seconds: 8 }, Date.now() + 1)!
    const third = voiceprints.add({ embedding: new Float32Array([0.6, 0.8]), seconds: 8 }, Date.now() + 1)!
    voiceprints.setEnabled(second, false)
    // The store follows voiceprint changes in a watcher, so let it see them before the tracker loads.
    await nextTick()
    await trackers.acquire()
    tracker.similarity.mockResolvedValueOnce(new Float32Array([0.42])).mockResolvedValueOnce(new Float32Array([0.71]))

    expect(await trackers.compare(audioWindow(new Float32Array(16000)))).toEqual([
      { speakerId: first, score: expect.closeTo(0.42) },
      { speakerId: third, score: expect.closeTo(0.71) },
    ])

    expect(tracker.enrollVoiceprint).toHaveBeenCalledTimes(2)
    expect(tracker.similarity).toHaveBeenNthCalledWith(1, new Float32Array(16000), 16000, 0, { windowSeconds: 1, stepSeconds: 1 })
    expect(tracker.similarity).toHaveBeenNthCalledWith(2, new Float32Array(16000), 16000, 1, { windowSeconds: 1, stepSeconds: 1 })
    dispose()
  })

  it('does not enroll the voiceprints again when only a label changes', async () => {
    const { trackers, voiceprints, dispose } = createStores()
    const id = voiceprints.add({ embedding: new Float32Array([1, 0]), seconds: 8 }, Date.now() + 1)!
    await nextTick()
    await trackers.acquire()
    tracker.reset.mockClear()

    voiceprints.rename(id, 'English')
    // A new enrollment starts only after some promise steps, so the check waits until they are done.
    await new Promise(resolve => setTimeout(resolve))

    expect(tracker.reset).not.toHaveBeenCalled()
    dispose()
  })

  it('clamps the samples, because the tracker rejects samples outside [-1, 1]', async () => {
    const { trackers, voiceprints, dispose } = createStores()
    voiceprints.add({ embedding: new Float32Array([1, 0]), seconds: 8 }, Date.now() + 1)
    await trackers.acquire()
    const channel = new Float32Array(16000)
    channel.set([1.5, -1.5, Number.NaN, 0.25])

    await trackers.compare(audioWindow(channel))

    expect(tracker.similarity.mock.calls[0]![0].slice(0, 4)).toEqual(new Float32Array([1, -1, 0, 0.25]))
    dispose()
  })

  it('compares nothing in a comparison that a release ends', async () => {
    const { trackers, voiceprints, dispose } = createStores()
    voiceprints.add({ embedding: new Float32Array([1, 0]), seconds: 8 }, Date.now() + 1)
    await trackers.acquire()
    const comparing = Promise.withResolvers<Float32Array<ArrayBuffer>>()
    tracker.similarity.mockImplementationOnce(async () => comparing.promise)

    const result = trackers.compare(audioWindow(new Float32Array(16000)))
    await vi.waitFor(() => expect(tracker.similarity).toHaveBeenCalledOnce())
    trackers.release()
    // Sherpaw rejects the calls that still run when the tracker is disposed.
    comparing.reject(new Error('Speaker tracker has been disposed'))

    expect(await result).toEqual([])
    dispose()
  })

  it('rejects a comparison that fails without a release', async () => {
    const { trackers, voiceprints, dispose } = createStores()
    voiceprints.add({ embedding: new Float32Array([1, 0]), seconds: 8 }, Date.now() + 1)
    await trackers.acquire()
    tracker.similarity.mockRejectedValueOnce(new Error('Speaker 0 has no voice to compare with yet'))

    await expect(trackers.compare(audioWindow(new Float32Array(16000)))).rejects.toThrow('Speaker 0 has no voice to compare with yet')
    dispose()
  })

  it('compares nothing without loading a tracker that is not ready', async () => {
    const { trackers, dispose } = createStores()

    expect(await trackers.compare(audioWindow(new Float32Array(16000)))).toEqual([])

    expect(loadSpeakerTracker).not.toHaveBeenCalled()
    expect(trackers.preparation).toBe('idle')
    dispose()
  })

  it('does not load a released tracker again', async () => {
    const { trackers, dispose } = createStores()
    await trackers.acquire()
    trackers.release()

    expect(await trackers.compare(audioWindow(new Float32Array(16000)))).toEqual([])

    expect(loadSpeakerTracker).toHaveBeenCalledOnce()
    expect(trackers.preparation).toBe('idle')
    dispose()
  })
})
