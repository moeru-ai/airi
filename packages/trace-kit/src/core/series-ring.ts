/** How long a series keeps its points. */
export interface SeriesRetention {
  /** Points older than this go. */
  maxAgeMs: number
  /** Points newer than this keep the full rate. Older points keep the minimum and the maximum of each second. */
  fullRateMs: number
}

/** The retention of the collector rings, and the default retention of a live timeline. */
export const DEFAULT_SERIES_RETENTION: Readonly<SeriesRetention> = { maxAgeMs: 30 * 60_000, fullRateMs: 5 * 60_000 }

/**
 * A columnar ring of one series: point times on the trace clock and their values.
 *
 * Retention: points newer than `fullRateMs` keep the full rate. Older points keep the minimum and the maximum of each
 * second, so a long view still shows peaks. Points older than `maxAgeMs` go.
 */
export class SeriesRing {
  private times = new Float64Array(256)
  private values = new Float32Array(256)
  private length = 0
  /** Points before this index are already reduced to one second buckets. */
  private compactedUntil = 0
  private changes = 0

  constructor(private readonly maxAgeMs: number, private readonly fullRateMs: number) {}

  get size(): number {
    return this.length
  }

  /**
   * Changes when points that were already in the ring change: a compaction, an expiry, or a late point inserted
   * before newer points. A reader that copies points incrementally starts again after a change.
   */
  get revision(): number {
    return this.changes
  }

  /** The point times, in time order. The view is valid until the next append or compaction. */
  timesView(): Float64Array {
    return this.times.subarray(0, this.length)
  }

  /** The point values, in the order of `timesView`. The view is valid until the next append or compaction. */
  valuesView(): Float32Array {
    return this.values.subarray(0, this.length)
  }

  append(time: number, value: number): void {
    if (this.length === this.times.length)
      this.grow()
    // Points arrive almost in order. A late point is inserted at its place, so reads stay sorted and expiry finds it.
    let index = this.length
    while (index > 0 && this.times[index - 1]! > time)
      index--
    if (index < this.length) {
      this.changes++
      this.times.copyWithin(index + 1, index, this.length)
      this.values.copyWithin(index + 1, index, this.length)
    }
    this.times[index] = time
    this.values[index] = value
    this.length++
    // A point older than a compacted point joins the compacted prefix as it is. It is one more point in its bucket.
    if (index < this.compactedUntil)
      this.compactedUntil++
  }

  /** Reduces old points and drops expired points. `now` is on the trace clock. */
  compact(now: number): void {
    const expiry = now - this.maxAgeMs
    let start = 0
    while (start < this.length && this.times[start]! < expiry)
      start++
    if (start > 0)
      this.shift(start)

    const fullRateStart = now - this.fullRateMs
    let end = this.compactedUntil
    while (end < this.length && this.times[end]! < fullRateStart)
      end++
    if (end === this.compactedUntil)
      return

    // Reduce [compactedUntil, end) to the min and max point of each second, in time order.
    const reducedTimes: number[] = []
    const reducedValues: number[] = []
    let index = this.compactedUntil
    while (index < end) {
      const bucket = Math.floor(this.times[index]! / 1000)
      let minIndex = index
      let maxIndex = index
      while (index < end && Math.floor(this.times[index]! / 1000) === bucket) {
        if (this.values[index]! < this.values[minIndex]!)
          minIndex = index
        if (this.values[index]! > this.values[maxIndex]!)
          maxIndex = index
        index++
      }
      for (const kept of minIndex === maxIndex ? [minIndex] : [Math.min(minIndex, maxIndex), Math.max(minIndex, maxIndex)]) {
        reducedTimes.push(this.times[kept]!)
        reducedValues.push(this.values[kept]!)
      }
    }

    const removed = (end - this.compactedUntil) - reducedTimes.length
    if (removed > 0)
      this.changes++
    this.times.set(reducedTimes, this.compactedUntil)
    this.values.set(reducedValues, this.compactedUntil)
    this.times.copyWithin(this.compactedUntil + reducedTimes.length, end, this.length)
    this.values.copyWithin(this.compactedUntil + reducedTimes.length, end, this.length)
    this.length -= removed
    this.compactedUntil += reducedTimes.length
  }

  /** A copy of the points, in time order. */
  read(): { times: number[], values: number[] } {
    return {
      times: Array.from(this.times.subarray(0, this.length)),
      values: Array.from(this.values.subarray(0, this.length)),
    }
  }

  private shift(count: number): void {
    this.changes++
    this.times.copyWithin(0, count, this.length)
    this.values.copyWithin(0, count, this.length)
    this.length -= count
    this.compactedUntil = Math.max(0, this.compactedUntil - count)
  }

  private grow(): void {
    const times = new Float64Array(this.times.length * 2)
    const values = new Float32Array(this.values.length * 2)
    times.set(this.times)
    values.set(this.values)
    this.times = times
    this.values = values
  }
}
