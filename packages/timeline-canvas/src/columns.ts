import { lowerBound, upperBound } from './search'

/** Growth factor of a column when it is full. */
const GROWTH = 2
const INITIAL_CAPACITY = 64

/** A copy of a typed array with more capacity. */
export function grow<T extends Float64Array | Float32Array | Uint16Array>(array: T, capacity: number): T {
  const next = new (array.constructor as new (length: number) => T)(capacity)
  next.set(array)
  return next
}

/**
 * Intervals in columns of typed arrays, sorted by start.
 *
 * - An open interval has the end `NaN`. It draws to the time that the caller gives as now.
 * - `style` indexes the style table of the lane, so a million items need no style objects.
 * - `keys` hold the identity of each item, for example a span key, for selection and hover.
 * - `maxSpan` is the length of the longest closed interval. A visible search starts this far before the view, so it
 *   finds intervals that start before the view and end inside it. An open interval is kept in `openIndices` instead.
 *
 * Appends must come in start order. An out-of-order append inserts with a copy, which is slow but correct.
 */
export class IntervalColumn {
  starts = new Float64Array(INITIAL_CAPACITY)
  ends = new Float64Array(INITIAL_CAPACITY)
  styles = new Uint16Array(INITIAL_CAPACITY)
  keys: string[] = []
  count = 0
  maxSpan = 0
  /** Indices of open intervals. An open interval can start long before the view and still cover it. */
  readonly openIndices = new Set<number>()

  append(start: number, end: number | undefined, style: number, key: string): number {
    this.ensureCapacity(this.count + 1)
    let index = this.count
    if (index > 0 && this.starts[index - 1]! > start) {
      index = upperBound(this.starts, this.count, start)
      this.starts.copyWithin(index + 1, index, this.count)
      this.ends.copyWithin(index + 1, index, this.count)
      this.styles.copyWithin(index + 1, index, this.count)
      this.keys.splice(index, 0, key)
      this.shiftOpenIndices(index)
    }
    else {
      this.keys.push(key)
    }
    this.starts[index] = start
    this.ends[index] = end ?? Number.NaN
    this.styles[index] = style
    this.count++
    if (end === undefined)
      this.openIndices.add(index)
    else
      this.maxSpan = Math.max(this.maxSpan, end - start)
    return index
  }

  /** Closes an open interval, for example when its span ends. */
  close(index: number, end: number): void {
    this.ends[index] = end
    this.openIndices.delete(index)
    this.maxSpan = Math.max(this.maxSpan, end - this.starts[index]!)
  }

  setStyle(index: number, style: number): void {
    this.styles[index] = style
  }

  /**
   * The index range `[begin, end)` of intervals that can overlap `[from, to]`. Open intervals before `begin` are in
   * `openIndices`. Some intervals inside the range can still end before `from`, so a caller checks each end.
   */
  visibleRange(from: number, to: number): { begin: number, end: number } {
    return {
      begin: lowerBound(this.starts, this.count, from - this.maxSpan),
      end: upperBound(this.starts, this.count, to),
    }
  }

  private ensureCapacity(capacity: number) {
    if (capacity <= this.starts.length)
      return
    const next = Math.max(capacity, this.starts.length * GROWTH)
    this.starts = grow(this.starts, next)
    this.ends = grow(this.ends, next)
    this.styles = grow(this.styles, next)
  }

  private shiftOpenIndices(from: number) {
    const shifted = [...this.openIndices].map(index => index >= from ? index + 1 : index)
    this.openIndices.clear()
    for (const index of shifted)
      this.openIndices.add(index)
  }
}

/** Points in columns of typed arrays, sorted by time. Same append rules as {@link IntervalColumn}. */
export class PointColumn {
  times = new Float64Array(INITIAL_CAPACITY)
  styles = new Uint16Array(INITIAL_CAPACITY)
  keys: string[] = []
  count = 0

  append(time: number, style: number, key: string): number {
    if (this.count + 1 > this.times.length) {
      const next = this.times.length * GROWTH
      this.times = grow(this.times, next)
      this.styles = grow(this.styles, next)
    }
    let index = this.count
    if (index > 0 && this.times[index - 1]! > time) {
      index = upperBound(this.times, this.count, time)
      this.times.copyWithin(index + 1, index, this.count)
      this.styles.copyWithin(index + 1, index, this.count)
      this.keys.splice(index, 0, key)
    }
    else {
      this.keys.push(key)
    }
    this.times[index] = time
    this.styles[index] = style
    this.count++
    return index
  }

  visibleRange(from: number, to: number): { begin: number, end: number } {
    return { begin: lowerBound(this.times, this.count, from), end: upperBound(this.times, this.count, to) }
  }
}
