export interface WatermarkOptions {
  /** How far behind the newest time an event can be before it is late. */
  readonly allowedLatenessMs: number
}

/**
 * Tracks the newest event time of a stream and marks events that arrive too late.
 *
 * A late event is still an event. The caller decides what to do with it, for example count it or flag it in a view.
 *
 * @example
 * const watermark = new Watermark({ allowedLatenessMs: 2000 })
 * watermark.observe(10_000) // => { late: false }
 * watermark.observe(7_000) // => { late: true }
 */
export class Watermark {
  private newestTime = Number.NEGATIVE_INFINITY

  constructor(private readonly options: WatermarkOptions) {}

  /** The newest time observed. `-Infinity` before the first event. */
  get newest(): number {
    return this.newestTime
  }

  observe(time: number): { late: boolean } {
    const late = time < this.newestTime - this.options.allowedLatenessMs
    this.newestTime = Math.max(this.newestTime, time)
    return { late }
  }
}
