import type { SpeakerTracker } from '@sherpaw/speaker-diarization'

import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { afterEach, describe, expect, it, vi } from 'vitest'

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
  it('compares the window with the owner as one window', async () => {
    const { trackers, voiceprints, dispose } = createStores()
    voiceprints.save({ embedding: new Float32Array([1, 0]), seconds: 8 }, Date.now() + 1)
    await trackers.acquire()

    expect(await trackers.compareOwner(audioWindow(new Float32Array(16000)))).toBeCloseTo(0.42)

    expect(tracker.similarity).toHaveBeenCalledWith(new Float32Array(16000), 16000, 0, { windowSeconds: 1, stepSeconds: 1 })
    dispose()
  })

  it('clamps the samples, because the tracker rejects samples outside [-1, 1]', async () => {
    const { trackers, voiceprints, dispose } = createStores()
    voiceprints.save({ embedding: new Float32Array([1, 0]), seconds: 8 }, Date.now() + 1)
    await trackers.acquire()
    const channel = new Float32Array(16000)
    channel.set([1.5, -1.5, Number.NaN, 0.25])

    await trackers.compareOwner(audioWindow(channel))

    expect(tracker.similarity.mock.calls[0]![0].slice(0, 4)).toEqual(new Float32Array([1, -1, 0, 0.25]))
    dispose()
  })

  it('returns NaN without loading a tracker that is not ready', async () => {
    const { trackers, dispose } = createStores()

    expect(await trackers.compareOwner(audioWindow(new Float32Array(16000)))).toBeNaN()

    expect(loadSpeakerTracker).not.toHaveBeenCalled()
    expect(trackers.preparation).toBe('idle')
    dispose()
  })

  it('does not load a released tracker again', async () => {
    const { trackers, dispose } = createStores()
    await trackers.acquire()
    trackers.release()

    expect(await trackers.compareOwner(audioWindow(new Float32Array(16000)))).toBeNaN()

    expect(loadSpeakerTracker).toHaveBeenCalledOnce()
    expect(trackers.preparation).toBe('idle')
    dispose()
  })
})
