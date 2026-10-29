/** A linear map `to = from * slope + offset` from one clock to another. */
interface LinearMap {
  slope: number
  offset: number
  estimated: boolean
}

interface PairSample {
  from: number
  to: number
  uncertaintyMs: number
  estimated: boolean
}

/**
 * The samples of one clock pair since the last discontinuity of either clock.
 * `startFrom` is the first `from` value of the segment. A value earlier than it belongs to an older segment.
 */
interface PairSegment {
  startFrom: number
  samples: PairSample[]
}

export interface ClockConversion {
  value: number
  /** A clock on the path has no measured latency, or a pair has only one sample of a non-ms clock. */
  estimated: boolean
}

export interface ClockGraphOptions {
  /**
   * Snapshots in the drift fit of each clock pair. A drift of 50 ppm adds 3 ms each minute, so offset alone is not
   * enough for long sessions.
   * @default 16
   */
  fitWindow?: number
}

const DEFAULT_OPTIONS: Required<ClockGraphOptions> = { fitWindow: 16 }

/** Weight floor in ms, so a sample with zero uncertainty does not take the whole fit. */
const MIN_UNCERTAINTY_MS = 0.05

/**
 * Converts values of any clock to one trace clock.
 *
 * State model:
 * - Each `clock.snapshot` adds one sample to every clock pair in it, in both directions.
 * - A `clock.discontinuity` starts a new segment for each pair of that clock. Values after it use only later samples.
 * - A conversion walks the shortest path of pairs from the clock to the trace clock, and composes the fits.
 *
 * The graph does not read a clock. It is a pure function of the snapshots that it received.
 */
export class ClockGraph {
  private readonly options: Required<ClockGraphOptions>
  /** Units of each clock in one millisecond. A media clock in frames at 48 kHz has 48. */
  private readonly unitsPerMs = new Map<string, number>()
  private readonly pairs = new Map<string, Map<string, PairSegment[]>>()
  private readonly paths = new Map<string, string[] | null>()

  constructor(readonly traceClock: string, options?: ClockGraphOptions) {
    this.options = { ...DEFAULT_OPTIONS, ...options }
  }

  /** Declares the unit of a clock. A clock without a declared unit counts in milliseconds. */
  setUnitsPerMs(clock: string, unitsPerMs: number): void {
    this.unitsPerMs.set(clock, unitsPerMs)
  }

  addSnapshot(values: { clock: string, value: number }[], uncertaintyMs: number, estimated = false): void {
    for (const [index, a] of values.entries()) {
      for (const b of values.slice(index + 1)) {
        if (a.clock === b.clock)
          continue
        this.addSample(a.clock, b.clock, { from: a.value, to: b.value, uncertaintyMs, estimated })
        this.addSample(b.clock, a.clock, { from: b.value, to: a.value, uncertaintyMs, estimated })
      }
    }
  }

  /** Starts a new segment for every pair of `clock`. Earlier samples stay for values before the jump. */
  addDiscontinuity(clock: string): void {
    for (const [from, targets] of this.pairs) {
      for (const [to, segments] of targets) {
        if (from === clock || to === clock)
          segments.push({ startFrom: Number.POSITIVE_INFINITY, samples: [] })
      }
    }
  }

  /** Converts a value of `clock` to the trace clock. Returns `undefined` when no snapshot path exists. */
  convert(clock: string, value: number): ClockConversion | undefined {
    if (clock === this.traceClock)
      return { value, estimated: false }

    const path = this.pathTo(clock)
    if (!path)
      return undefined

    let current = value
    let estimated = false
    for (let index = 0; index < path.length - 1; index++) {
      const map = this.fit(path[index]!, path[index + 1]!, current)
      if (!map)
        return undefined
      current = current * map.slope + map.offset
      estimated ||= map.estimated
    }
    return { value: current, estimated }
  }

  private addSample(from: string, to: string, sample: PairSample): void {
    let targets = this.pairs.get(from)
    if (!targets) {
      targets = new Map()
      this.pairs.set(from, targets)
    }
    let segments = targets.get(to)
    if (!segments) {
      segments = []
      targets.set(to, segments)
      // A new edge can shorten or create paths.
      this.paths.clear()
    }
    let segment = segments.at(-1)
    if (!segment) {
      segment = { startFrom: sample.from, samples: [] }
      segments.push(segment)
    }
    if (segment.samples.length === 0)
      segment.startFrom = sample.from
    segment.samples.push(sample)
    if (segment.samples.length > this.options.fitWindow)
      segment.samples.shift()
  }

  /**
   * Fits `to = from * slope + offset` over the samples of the segment that holds `value`.
   *
   * One sample gives the offset only, with the slope from the declared units. Two or more samples give a weighted
   * least squares fit, which also measures drift. Each sample weighs `1 / uncertainty²`.
   */
  private fit(from: string, to: string, value: number): LinearMap | undefined {
    const segments = this.pairs.get(from)?.get(to)
    if (!segments)
      return undefined

    // The latest segment that started at or before the value. Values before every segment use the first one.
    let segment = segments.find(candidate => candidate.samples.length > 0)
    for (const candidate of segments) {
      if (candidate.samples.length > 0 && candidate.startFrom <= value)
        segment = candidate
    }
    if (!segment)
      return undefined

    const unitSlope = (this.unitsPerMs.get(to) ?? 1) / (this.unitsPerMs.get(from) ?? 1)
    const samples = segment.samples
    const estimated = samples.some(sample => sample.estimated)
    if (samples.length === 1) {
      const sample = samples[0]!
      return { slope: unitSlope, offset: sample.to - sample.from * unitSlope, estimated: estimated || unitSlope !== 1 }
    }

    // Center the values before the fit. Raw clock values near 1e12 lose precision when squared.
    let weightSum = 0
    let meanFrom = 0
    let meanTo = 0
    for (const sample of samples) {
      const weight = 1 / Math.max(sample.uncertaintyMs, MIN_UNCERTAINTY_MS) ** 2
      weightSum += weight
      meanFrom += weight * sample.from
      meanTo += weight * sample.to
    }
    meanFrom /= weightSum
    meanTo /= weightSum

    let covariance = 0
    let variance = 0
    for (const sample of samples) {
      const weight = 1 / Math.max(sample.uncertaintyMs, MIN_UNCERTAINTY_MS) ** 2
      covariance += weight * (sample.from - meanFrom) * (sample.to - meanTo)
      variance += weight * (sample.from - meanFrom) ** 2
    }

    // Samples at one `from` value carry no drift information. Keep the declared unit slope.
    const slope = variance > 0 ? covariance / variance : unitSlope
    return { slope, offset: meanTo - meanFrom * slope, estimated }
  }

  /** Breadth-first search from `clock` to the trace clock. The result is cached until a new pair appears. */
  private pathTo(clock: string): string[] | undefined {
    const cached = this.paths.get(clock)
    if (cached !== undefined)
      return cached ?? undefined

    const previous = new Map<string, string>([[clock, clock]])
    const queue = [clock]
    while (queue.length > 0) {
      const current = queue.shift()!
      if (current === this.traceClock)
        break
      for (const next of this.pairs.get(current)?.keys() ?? []) {
        if (previous.has(next))
          continue
        previous.set(next, current)
        queue.push(next)
      }
    }

    if (!previous.has(this.traceClock)) {
      this.paths.set(clock, null)
      return undefined
    }

    const path = [this.traceClock]
    while (path[0] !== clock)
      path.unshift(previous.get(path[0]!)!)
    this.paths.set(clock, path)
    return path
  }
}

export interface ClockPingSample {
  /** The local clock value at the middle of the round trip. */
  local: number
  /** The remote clock value that the reply carried. */
  remote: number
  /** Half the round trip. */
  uncertaintyMs: number
}

/**
 * Runs a ping exchange with a remote clock and returns the sample with the smallest round trip.
 *
 * Each ping asks the remote side for its clock value. The local value at the middle of the round trip pairs with it.
 * Half the round trip is the uncertainty. A failed ping is skipped. Returns `undefined` when every ping failed.
 */
export async function measureClockOffset(options: {
  ping: () => Promise<number>
  now: () => number
  /** @default 5 */
  count?: number
}): Promise<ClockPingSample | undefined> {
  let best: ClockPingSample | undefined
  for (let index = 0; index < (options.count ?? 5); index++) {
    const sentAt = options.now()
    let remote: number
    try {
      remote = await options.ping()
    }
    catch {
      continue
    }
    const receivedAt = options.now()
    const uncertaintyMs = (receivedAt - sentAt) / 2
    if (!best || uncertaintyMs < best.uncertaintyMs)
      best = { local: sentAt + uncertaintyMs, remote, uncertaintyMs }
  }
  return best
}
