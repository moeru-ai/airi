/**
 * Accepts each sequence number once, in any arrival order.
 *
 * Numbers below `nextSeq` and repeats are not new. A number above `nextSeq` waits in a set until the numbers before
 * it arrive. `nextSeq - 1` is the end of the unbroken prefix, so a reader can resume from it.
 *
 * @example
 * const tracker = new SequenceTracker()
 * tracker.accept(1) // => true, waits for 0
 * tracker.accept(0) // => true, nextSeq is now 2
 * tracker.accept(1) // => false
 */
export class SequenceTracker {
  private next: number
  private readonly ahead = new Set<number>()

  constructor(firstSeq = 0) {
    this.next = firstSeq
  }

  /** The lowest number that did not arrive yet. */
  get nextSeq(): number {
    return this.next
  }

  /** Returns true when `seq` is new. */
  accept(seq: number): boolean {
    if (seq < this.next || this.ahead.has(seq))
      return false
    this.ahead.add(seq)
    while (this.ahead.delete(this.next))
      this.next++
    return true
  }
}
