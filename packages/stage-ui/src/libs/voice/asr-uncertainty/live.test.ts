import type { RawSegment } from './events'

import { describe, expect, it } from 'vitest'

import { defaultNucleusOptions } from './articulation'
import { AudioHistory, planLiveStreams, selectSpeech, streamedProbeResult } from './live'
import { samplePerturbations } from './perturbation'

const sampleRate = 16000
const options = { nucleus: defaultNucleusOptions, minNuclei: 2, marginSeconds: 0.3 }

/** Silence, then syllables of 0.15 s every 0.25 s, at `amplitude`. */
function speechAfter(silenceSeconds: number, syllables: number, amplitude: number) {
  const length = Math.round((silenceSeconds + 0.25 * syllables + 0.2) * sampleRate)
  return Float32Array.from({ length }, (_, index) => {
    const time = index / sampleRate - silenceSeconds
    const local = time % 0.25
    const envelope = time >= 0 && time < 0.25 * syllables && local < 0.15 ? amplitude * Math.sin(Math.PI * local / 0.15) : 0
    // A little noise keeps silence from becoming -120 dB, as on a real microphone.
    return envelope * Math.sin(2 * Math.PI * 180 * index / sampleRate) + 0.0005 * Math.sin(index * 12.9898)
  })
}

describe('audioHistory', () => {
  it('copies across chunk borders and leaves out dropped audio', () => {
    const history = new AudioHistory(10)
    history.append(Float32Array.from([0, 1, 2, 3, 4]))
    history.append(Float32Array.from([5, 6, 7, 8, 9]))

    expect(history.slice(0.3, 0.7)).toEqual(Float32Array.from([3, 4, 5, 6]))
    history.dropBefore(0.6)
    expect(history.slice(0.3, 0.7)).toEqual(Float32Array.from([5, 6]))
  })
})

describe('selectSpeech', () => {
  it('cuts the pause before the speech of a segment with tokens', () => {
    const selection = selectSpeech(speechAfter(2, 3, 0.5), sampleRate, true, undefined, options)

    expect(selection?.offset).toBeGreaterThan(1.5)
    expect(selection?.offset).toBeLessThan(2)
  })

  it('skips a silent segment without tokens', () => {
    const speechDb = selectSpeech(speechAfter(0.2, 3, 0.5), sampleRate, true, undefined, options)!.loudDb

    expect(selectSpeech(speechAfter(2, 0, 0), sampleRate, false, speechDb, options)).toBeUndefined()
  })

  it('keeps a segment without tokens when it has syllables as loud as earlier speech', () => {
    const speechDb = selectSpeech(speechAfter(0.2, 3, 0.5), sampleRate, true, undefined, options)!.loudDb

    expect(selectSpeech(speechAfter(1, 3, 0.3), sampleRate, false, speechDb, options)?.offset).toBeGreaterThan(0.5)
    // Without earlier speech there is no level to compare with.
    expect(selectSpeech(speechAfter(1, 3, 0.3), sampleRate, false, undefined, options)).toBeUndefined()
  })
})

describe('planLiveStreams', () => {
  const perturbations = samplePerturbations(4, { snrDb: [10, 20], shiftMs: [0, 0], speed: [1, 1] }, 1)

  it('leads with the clean stream and gives each other stream to the Worker with the fewest', () => {
    const plan = planLiveStreams(perturbations, 2, 3)

    expect(plan.workers.map(streams => streams.length)).toEqual([2, 2, 2])
    expect(plan.workers[0][0]).toEqual({ blankPenalty: 0 })
    expect(plan.rollouts).toEqual([{ worker: 1, stream: 0 }, { worker: 2, stream: 0 }, { worker: 1, stream: 1 }, { worker: 2, stream: 1 }])
    expect(plan.workers[2][1]).toEqual({ noise: { snrDb: perturbations[3].snrDb, seed: perturbations[3].seed }, blankPenalty: 0 })
    expect(plan.probe).toEqual({ worker: 0, stream: 1 })
    expect(plan.workers[0][1]).toEqual({ blankPenalty: 2 })
  })

  it('plans no Worker without streams', () => {
    const plan = planLiveStreams(perturbations.slice(0, 2), 0, 8)

    expect(plan.workers.map(streams => streams.length)).toEqual([1, 1, 1])
  })

  it('gives the leading Worker no more streams than any follower', () => {
    const plan = planLiveStreams(samplePerturbations(8, { snrDb: [10, 20], shiftMs: [0, 0], speed: [1, 1] }, 1), 2, 3)

    expect(plan.workers.map(streams => streams.length)).toEqual([3, 4, 3])
  })

  it('attaches encoder rollouts to the reference, so they need no Worker of their own', () => {
    const rollouts = { count: 12, sigma: 1, seed: 1 }
    const plan = planLiveStreams([], 2, 3, rollouts)

    expect(plan.workers).toEqual([[{ blankPenalty: 0, rollouts }], [{ blankPenalty: 2 }]])
    expect(plan.rollouts).toEqual([])
  })

  it('puts every stream in one Worker and skips the probe without a blank penalty', () => {
    const plan = planLiveStreams(perturbations, 0, 1)

    expect(plan.workers.map(streams => streams.length)).toEqual([5])
    expect(plan.rollouts.map(place => place.stream)).toEqual([1, 2, 3, 4])
    expect(plan.probe).toBeUndefined()
  })
})

describe('streamedProbeResult', () => {
  const perturbations = samplePerturbations(2, { snrDb: [10, 20], shiftMs: [0, 0], speed: [1, 1] }, 1)
  const plan = planLiveStreams(perturbations, 0, 2)
  const clip = new Float32Array(16000)

  /** A segment that starts 3 s into the input. */
  function segment(tokens: string[], timestamps: number[]): RawSegment {
    return { text: tokens.join(''), tokens, timestamps, ysProbs: tokens.map(() => -0.1), startTime: 3 }
  }

  /** The cuts of each Worker, with no `encoder` rollouts. */
  function cuts(segments: RawSegment[][]) {
    return segments.map(worker => ({ segments: worker, rollouts: worker.map(() => []) }))
  }

  it('moves the tokens onto the clip clock and drops the tokens before the clip', () => {
    // The plan puts the reference in Worker 0 and both rollouts in Worker 1.
    const segments = [
      [segment(['a', 'b', 'c'], [0.5, 1.2, 1.6])],
      [segment(['a', 'b'], [0.5, 1.3]), segment(['b', 'd'], [1.2, 1.7])],
    ]
    const result = streamedProbeResult(clip, 16000, 4, cuts(segments), plan, perturbations)

    expect(result.durationSeconds).toBe(1)
    expect(result.reference.tokens.map(token => token.text)).toEqual(['b', 'c'])
    expect(result.reference.tokens[0].time).toBeCloseTo(0.2)
    expect(result.reference.tokens[1].time).toBeCloseTo(0.6)
    expect(result.samples.map(sample => sample.hypothesis.tokens.map(token => token.text))).toEqual([['b'], ['b', 'd']])
    expect(result.samples[1].perturbation).toBe(perturbations[1])
    expect(result.probe).toBeUndefined()
    expect(result.stoppedEarly).toBe(false)
  })

  it('keeps every token of a segment without token times', () => {
    const segments = [
      [segment(['a', 'b'], [])],
      [segment(['b'], []), segment(['a'], [])],
    ]
    const result = streamedProbeResult(clip, 16000, 4, cuts(segments), plan, perturbations)

    expect(result.reference.tokens).toEqual([{ text: 'a', time: undefined, logProbability: -0.1 }, { text: 'b', time: undefined, logProbability: -0.1 }])
  })

  it('reports a Worker that returned too few segments', () => {
    const segments = [[segment(['a'], [1.2])], []]

    expect(() => streamedProbeResult(clip, 16000, 4, cuts(segments), plan, perturbations)).toThrow('Worker 1 returned no segment for stream 0.')
  })

  it('adds the encoder rollouts of the reference on the clip clock', () => {
    const encoderPlan = planLiveStreams([], 0, 2, { count: 2, sigma: 1, seed: 1 })
    const endpoints = [{
      segments: [segment(['a', 'b'], [0.5, 1.2])],
      rollouts: [[segment(['a', 'b'], [0.5, 1.2]), segment(['a', 'd'], [0.5, 1.3])]],
    }]

    const result = streamedProbeResult(clip, 16000, 4, endpoints, encoderPlan, [])

    expect(result.reference.tokens.map(token => token.text)).toEqual(['b'])
    expect(result.samples.map(sample => sample.hypothesis.tokens.map(token => token.text))).toEqual([['b'], ['d']])
    expect(result.samples[1].hypothesis.tokens[0].time).toBeCloseTo(0.3)
    expect(result.samples[1].perturbation).toBeUndefined()
  })
})
