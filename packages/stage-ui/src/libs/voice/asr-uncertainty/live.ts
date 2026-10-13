import type { NucleusOptions } from './articulation'
import type { LiveStreamSpec, RawSegment } from './events'
import type { Perturbation } from './perturbation'
import type { ProbeResult } from './probe'

import { toHypothesis } from './analysis'
import { measureIntensity } from './articulation'
import { cleanPerturbation } from './perturbation'

/**
 * Keeps recent live audio, so a segment can be cut out after its endpoint.
 * Positions are seconds from the first appended sample.
 */
export class AudioHistory {
  private chunks: { start: number, samples: Float32Array }[] = []
  private appended = 0

  constructor(private readonly sampleRate: number) {}

  /** Seconds appended so far. */
  get duration(): number {
    return this.appended / this.sampleRate
  }

  append(samples: Float32Array): void {
    this.chunks.push({ start: this.appended, samples })
    this.appended += samples.length
  }

  /** Copies the audio from `start` to `end`. The copy starts later when `start` falls in dropped audio. */
  slice(start: number, end: number): Float32Array<ArrayBuffer> {
    const available = this.chunks[0]?.start ?? this.appended
    const from = Math.max(available, Math.round(start * this.sampleRate))
    const to = Math.min(this.appended, Math.round(end * this.sampleRate))
    const output = new Float32Array(Math.max(0, to - from))
    for (const chunk of this.chunks) {
      const begin = Math.max(from, chunk.start)
      const finish = Math.min(to, chunk.start + chunk.samples.length)
      if (begin < finish)
        output.set(chunk.samples.subarray(begin - chunk.start, finish - chunk.start), begin - from)
    }
    return output
  }

  /** Frees the chunks that end before `time`. */
  dropBefore(time: number): void {
    const position = Math.round(time * this.sampleRate)
    this.chunks = this.chunks.filter(chunk => chunk.start + chunk.samples.length > position)
  }
}

export interface SpeechSelection {
  /** Seconds from the segment start to the start of the speech, with a margin. */
  readonly offset: number
  /** The loudest level of this segment, in dBFS. Pass the highest one seen so far as `speechDb`. */
  readonly loudDb: number
}

export interface SpeechSelectionOptions {
  readonly nucleus: NucleusOptions
  /** Syllables that a segment without tokens needs before it counts as deleted speech. */
  readonly minNuclei: number
  /** Audio kept before the first loud frame, in seconds. @default 0.3 */
  readonly marginSeconds: number
}

/**
 * Finds where the speech of one live segment starts, or returns undefined when the segment holds none.
 *
 * A segment starts at the previous endpoint, so it can begin with a long pause. Cutting that pause
 * saves decode time. A segment whose reference has no tokens is either silence or speech that the
 * model deleted. It counts as speech only with `minNuclei` syllables louder than the silence level of
 * earlier speech, so `speechDb` must come from segments that had tokens.
 */
export function selectSpeech(samples: Float32Array, sampleRate: number, hasTokens: boolean, speechDb: number | undefined, options: SpeechSelectionOptions): SpeechSelection | undefined {
  const contour = measureIntensity(samples, sampleRate, options.nucleus)
  const loudDb = contour.silenceDb + options.nucleus.silenceRangeDb
  const reference = hasTokens ? Math.max(loudDb, speechDb ?? loudDb) : speechDb
  if (reference === undefined)
    return undefined
  const floorDb = reference - options.nucleus.silenceRangeDb

  if (!hasTokens) {
    const loudNuclei = contour.nuclei.filter(time => (contour.db[Math.round(time / contour.hopSeconds)] ?? Number.NEGATIVE_INFINITY) > floorDb)
    if (loudNuclei.length < options.minNuclei)
      return undefined
  }

  const firstLoud = contour.db.findIndex(value => value > floorDb)
  const offset = firstLoud < 0 ? 0 : Math.max(0, firstLoud * contour.hopSeconds - options.marginSeconds)
  return { offset, loudDb }
}

/** Where one live stream runs: the index of its Worker, and of the stream in that Worker. */
export interface StreamPlace {
  readonly worker: number
  readonly stream: number
}

export interface LiveStreamPlan {
  /** The streams of each Worker. Worker 0 leads, and its first stream is the clean reference. */
  readonly workers: readonly (readonly LiveStreamSpec[])[]
  /** The place of each perturbation's rollout, in perturbation order. */
  readonly rollouts: readonly StreamPlace[]
  /** The place of the blank penalty stream. Undefined when the penalty is 0. */
  readonly probe?: StreamPlace
}

/**
 * Spreads the live streams over at most `workerCount` Workers, and never over more Workers than streams.
 *
 * The clean reference leads in Worker 0. Its endpoints decide where every stream is cut. Each rollout
 * and the blank penalty stream go to the Worker with the fewest streams. A follower wins a tie, so the
 * leading Worker keeps up with the input first, and the partial text and the endpoints come on time.
 */
export function planLiveStreams(perturbations: readonly Perturbation[], blankPenalty: number, workerCount: number): LiveStreamPlan {
  // A Worker without streams would load the model for nothing.
  const streamCount = 1 + perturbations.length + (blankPenalty > 0 ? 1 : 0)
  const workers: LiveStreamSpec[][] = Array.from({ length: Math.max(1, Math.min(workerCount, streamCount)) }, () => [])
  workers[0].push({ blankPenalty: 0 })
  // Followers come first in this order, so they win ties.
  const order = [...workers.keys()].slice(1).concat(0)
  const place = (spec: LiveStreamSpec): StreamPlace => {
    const worker = order.reduce((best, index) => workers[index].length < workers[best].length ? index : best)
    workers[worker].push(spec)
    return { worker, stream: workers[worker].length - 1 }
  }
  const rollouts = perturbations.map(perturbation => place({ noise: { snrDb: perturbation.snrDb, seed: perturbation.seed }, blankPenalty: 0 }))
  const probe = blankPenalty > 0 ? place({ blankPenalty }) : undefined
  return { workers, rollouts, probe }
}

/**
 * Moves a live segment onto the clock of a clip that starts `clipStart` seconds into the input.
 * Tokens before the clip are dropped, because the clip leaves out the pause before the speech.
 * A segment without token times keeps all its tokens.
 */
function inClip(segment: RawSegment, clipStart: number): RawSegment {
  if (segment.timestamps.length !== segment.tokens.length)
    return { ...segment, startTime: 0 }
  const keep = segment.timestamps.map(time => segment.startTime + time >= clipStart)
  return {
    text: segment.text,
    tokens: segment.tokens.filter((_, index) => keep[index]),
    timestamps: segment.timestamps.flatMap((time, index) => keep[index] ? [segment.startTime + time - clipStart] : []),
    ysProbs: segment.ysProbs.filter((_, index) => keep[index]),
    startTime: 0,
  }
}

/**
 * Builds a probe result from the streamed decodes of one live segment.
 *
 * `segments` holds the segments of one cut, per Worker, in the order of `plan`. The live reference is
 * the reference. All streams share the same history of earlier input, so the reference needs no
 * separate clean decode.
 */
export function streamedProbeResult(
  clip: Float32Array,
  sampleRate: number,
  clipStart: number,
  segments: readonly (readonly RawSegment[])[],
  plan: LiveStreamPlan,
  perturbations: readonly Perturbation[],
): ProbeResult {
  const hypothesisAt = ({ worker, stream }: StreamPlace, perturbation: Perturbation) => {
    const segment = segments[worker]?.[stream]
    if (!segment)
      throw new Error(`Worker ${worker} returned no segment for stream ${stream}.`)
    return toHypothesis([inClip(segment, clipStart)], perturbation)
  }
  return {
    clip,
    durationSeconds: clip.length / sampleRate,
    reference: hypothesisAt({ worker: 0, stream: 0 }, cleanPerturbation),
    samples: plan.rollouts.map((place, index) => ({ perturbation: perturbations[index], hypothesis: hypothesisAt(place, perturbations[index]) })),
    probe: plan.probe && hypothesisAt(plan.probe, cleanPerturbation),
    stoppedEarly: false,
  }
}
