export interface RetentionBufferOptions<T> {
  /** Drops the oldest items while the total size is over this limit. @default Infinity */
  readonly maxBytes?: number
  /** `evict` drops items that are older than this. @default Infinity */
  readonly maxAgeMs?: number
  /** The size of an item. The buffer reads it once, at `push`. */
  readonly sizeOf: (item: T) => number
  /** The time of an item, in the clock of the `now` that `evict` receives. */
  readonly ageOf: (item: T) => number
  /** Receives each group of dropped items, oldest first. A caller can report the gap here. */
  readonly onEvict?: (items: T[]) => void
}

interface Entry<T> {
  item: T
  bytes: number
}

/** Compacts the storage when this many dropped slots wait at its head. */
const COMPACT_AFTER = 1024

/**
 * Keeps the newest items within a byte limit and an age limit, in insertion order.
 *
 * Only the head can drop, so the age limit assumes that `ageOf` grows with insertion order. An older item behind a
 * newer one stays until the newer one drops. A `push` applies only the byte limit, because the age limit needs `now`.
 * One item that is larger than `maxBytes` drops at once. Eviction costs time for the dropped items only.
 *
 * @example
 * const buffer = new RetentionBuffer<Entry>({ maxBytes: 8_000_000, maxAgeMs: 600_000, sizeOf: e => e.bytes, ageOf: e => e.observedAt })
 * buffer.push(entry)
 * buffer.evict(now) // call it from a periodic tick
 */
export class RetentionBuffer<T> {
  private entries: Entry<T>[] = []
  private head = 0
  private totalBytes = 0

  constructor(private readonly options: RetentionBufferOptions<T>) {}

  get size(): number {
    return this.entries.length - this.head
  }

  get bytes(): number {
    return this.totalBytes
  }

  push(item: T): void {
    const bytes = this.options.sizeOf(item)
    this.entries.push({ item, bytes })
    this.totalBytes += bytes
    this.evictWhile(() => this.totalBytes > (this.options.maxBytes ?? Number.POSITIVE_INFINITY))
  }

  /** Drops the items older than the age limit, then the oldest items over the byte limit. Returns the dropped items. */
  evict(now: number): T[] {
    const cutoff = now - (this.options.maxAgeMs ?? Number.POSITIVE_INFINITY)
    const maxBytes = this.options.maxBytes ?? Number.POSITIVE_INFINITY
    return this.evictWhile(entry => this.options.ageOf(entry.item) < cutoff || this.totalBytes > maxBytes)
  }

  /** The kept items, oldest first. Do not push or evict while you iterate. */
  * values(): IterableIterator<T> {
    for (let index = this.head; index < this.entries.length; index++)
      yield this.entries[index]!.item
  }

  /** Drops every item without `onEvict`. */
  clear(): void {
    this.entries = []
    this.head = 0
    this.totalBytes = 0
  }

  private evictWhile(shouldDrop: (entry: Entry<T>) => boolean): T[] {
    const dropped: T[] = []
    while (this.head < this.entries.length) {
      const entry = this.entries[this.head]!
      if (!shouldDrop(entry))
        break
      this.totalBytes -= entry.bytes
      dropped.push(entry.item)
      this.head++
    }
    if (dropped.length === 0)
      return dropped

    // Removing from the front of an array costs time for every kept item. Move the head instead, and remove the
    // dropped slots in one step only when they are many and at least half of the storage.
    if (this.head >= COMPACT_AFTER && this.head * 2 >= this.entries.length) {
      this.entries = this.entries.slice(this.head)
      this.head = 0
    }
    this.options.onEvict?.(dropped)
    return dropped
  }
}
