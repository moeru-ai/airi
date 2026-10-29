import type { TimelineView } from './view'

import { grow } from './columns'
import { lowerBound, upperBound } from './search'
import { pixelsPerMs } from './view'

/** Samples that one bucket of the next level covers. */
const FACTOR = 4

interface Level {
  /** Time of the first sample of each bucket. Level 0 holds the samples themselves. */
  times: Float64Array
  mins: Float32Array
  maxs: Float32Array
  count: number
}

/** The minimum and maximum of a series inside each pixel column. `NaN` marks a column without samples. */
export interface Envelope {
  mins: Float32Array
  maxs: Float32Array
  /** The level that the envelope read. Level 0 is the raw samples. */
  level: number
}

/**
 * A sample series with a min/max pyramid, for waveforms and level curves.
 *
 * Level 0 holds the samples. Each next level holds the minimum and maximum of {@link FACTOR} buckets of the level
 * below. An envelope reads the coarsest level that still has at least two buckets per pixel, so its work follows the
 * view width, not the series length.
 *
 * Samples must arrive in time order. Irregular intervals are fine, because each bucket keeps the time of its first
 * sample.
 */
export class SeriesPyramid {
  private readonly levels: Level[] = [createLevel(256)]

  get count(): number {
    return this.levels[0]!.count
  }

  get start(): number {
    return this.count > 0 ? this.levels[0]!.times[0]! : Number.NaN
  }

  get end(): number {
    return this.count > 0 ? this.levels[0]!.times[this.count - 1]! : Number.NaN
  }

  /** The average time between samples, or `NaN` with fewer than two samples. A gap between samples is longer. */
  get intervalMs(): number {
    return this.count > 1 ? (this.end - this.start) / (this.count - 1) : Number.NaN
  }

  append(time: number, value: number): void {
    this.push(0, time, value, value)
  }

  /** Appends many samples. `times` and `values` have the same length. */
  appendMany(times: ArrayLike<number>, values: ArrayLike<number>): void {
    for (let index = 0; index < times.length; index++)
      this.push(0, times[index]!, values[index]!, values[index]!)
  }

  /**
   * The widest gap in pixels that still joins two samples in the view: one and a half sample intervals, so a series
   * draws as one shape at any zoom, and a real pause in the samples still breaks it.
   */
  bridgePx(view: TimelineView): number {
    const interval = this.intervalMs
    return Number.isFinite(interval) ? interval * pixelsPerMs(view) * 1.5 : 0
  }

  /** The envelope of the view, one column for each `columnPx` pixels. */
  envelope(view: TimelineView, columnPx = 1): Envelope {
    const columns = Math.max(1, Math.ceil(view.width / columnPx))
    const mins = new Float32Array(columns).fill(Number.NaN)
    const maxs = new Float32Array(columns).fill(Number.NaN)
    const ppm = pixelsPerMs(view) / columnPx

    // The coarsest level whose bucket still spans at most half a column, so no column misses a peak between buckets.
    const raw = this.levels[0]!
    const visibleSamples = Math.max(1, upperBound(raw.times, raw.count, view.end) - lowerBound(raw.times, raw.count, view.start))
    let level = 0
    while (level + 1 < this.levels.length && visibleSamples / FACTOR ** (level + 1) >= columns * 2)
      level++

    const add = (time: number, min: number, max: number) => {
      const column = Math.floor((time - view.start) * ppm)
      if (column < 0 || column >= columns)
        return
      if (Number.isNaN(mins[column]!) || min < mins[column]!)
        mins[column] = min
      if (Number.isNaN(maxs[column]!) || max > maxs[column]!)
        maxs[column] = max
    }

    const data = this.levels[level]!
    // One bucket before the view, so the first column joins the samples that lead into the view.
    const begin = Math.max(0, lowerBound(data.times, data.count, view.start) - 1)
    const end = Math.min(data.count, upperBound(data.times, data.count, view.end) + 1)
    for (let index = begin; index < end; index++)
      add(data.times[index]!, data.mins[index]!, data.maxs[index]!)

    // The newest samples do not fill a bucket of this level yet. They come from the raw samples.
    for (let index = data.count * FACTOR ** level; index < raw.count; index++)
      add(raw.times[index]!, raw.mins[index]!, raw.maxs[index]!)
    return { mins, maxs, level }
  }

  private push(levelIndex: number, time: number, min: number, max: number): void {
    let level = this.levels[levelIndex]
    if (!level) {
      level = createLevel(64)
      this.levels.push(level)
    }
    if (level.count === level.times.length) {
      const capacity = level.times.length * 2
      level.times = grow(level.times, capacity)
      level.mins = grow(level.mins, capacity)
      level.maxs = grow(level.maxs, capacity)
    }
    level.times[level.count] = time
    level.mins[level.count] = min
    level.maxs[level.count] = max
    level.count++

    // A full group of buckets becomes one bucket of the next level.
    if (level.count % FACTOR === 0) {
      const first = level.count - FACTOR
      let groupMin = Number.POSITIVE_INFINITY
      let groupMax = Number.NEGATIVE_INFINITY
      for (let index = first; index < level.count; index++) {
        groupMin = Math.min(groupMin, level.mins[index]!)
        groupMax = Math.max(groupMax, level.maxs[index]!)
      }
      this.push(levelIndex + 1, level.times[first]!, groupMin, groupMax)
    }
  }
}

function createLevel(capacity: number): Level {
  return { times: new Float64Array(capacity), mins: new Float32Array(capacity), maxs: new Float32Array(capacity), count: 0 }
}

export interface WaveformColumnOptions {
  /** Empty runs of at most this many columns take the linear interpolation of the columns around them. */
  bridgeColumns: number
  /**
   * How much of each column comes from its two neighbors, from 0 (none) to 1. A small value takes the edge off the
   * steps between samples and keeps the peaks. @default 0.3
   */
  smoothing?: number
}

/**
 * The bar values of a waveform: the envelope with short gaps filled by linear interpolation, then blended a little with
 * the neighbor columns. A column in a long gap stays `undefined`, so a real pause still shows.
 */
export function waveformColumns(envelope: Envelope, options: WaveformColumnOptions): ({ min: number, max: number } | undefined)[] {
  const count = envelope.mins.length
  const values: ({ min: number, max: number } | undefined)[] = Array.from({ length: count })
  let previous = -1
  for (let column = 0; column < count; column++) {
    if (Number.isNaN(envelope.maxs[column]!))
      continue
    values[column] = { min: envelope.mins[column]!, max: envelope.maxs[column]! }
    if (previous >= 0 && column - previous > 1 && column - previous <= options.bridgeColumns) {
      for (let fill = previous + 1; fill < column; fill++) {
        const ratio = (fill - previous) / (column - previous)
        values[fill] = {
          min: envelope.mins[previous]! + (envelope.mins[column]! - envelope.mins[previous]!) * ratio,
          max: envelope.maxs[previous]! + (envelope.maxs[column]! - envelope.maxs[previous]!) * ratio,
        }
      }
    }
    previous = column
  }

  const smoothing = Math.min(1, Math.max(0, options.smoothing ?? 0.3))
  if (smoothing === 0)
    return values
  // A missing neighbor counts as the column itself, so the ends of a shape do not sag.
  return values.map((value, column) => {
    if (!value)
      return undefined
    const left = values[column - 1] ?? value
    const right = values[column + 1] ?? value
    return {
      min: value.min * (1 - smoothing) + (left.min + right.min) * smoothing / 2,
      max: value.max * (1 - smoothing) + (left.max + right.max) * smoothing / 2,
    }
  })
}
