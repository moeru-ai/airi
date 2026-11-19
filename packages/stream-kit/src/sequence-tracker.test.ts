import { describe, expect, it } from 'vitest'

import { SequenceTracker } from './sequence-tracker'

describe('sequenceTracker', () => {
  it('accepts numbers in order and rejects repeats', () => {
    const tracker = new SequenceTracker()

    expect(tracker.accept(0)).toBe(true)
    expect(tracker.accept(1)).toBe(true)
    expect(tracker.accept(1)).toBe(false)
    expect(tracker.accept(0)).toBe(false)
    expect(tracker.nextSeq).toBe(2)
  })

  it('holds out-of-order numbers until the prefix is complete', () => {
    const tracker = new SequenceTracker()

    expect(tracker.accept(2)).toBe(true)
    expect(tracker.accept(2)).toBe(false)
    expect(tracker.nextSeq).toBe(0)
    expect(tracker.accept(0)).toBe(true)
    expect(tracker.nextSeq).toBe(1)
    expect(tracker.accept(1)).toBe(true)
    expect(tracker.nextSeq).toBe(3)
  })

  it('starts from a given number', () => {
    const tracker = new SequenceTracker(10)

    expect(tracker.accept(9)).toBe(false)
    expect(tracker.accept(10)).toBe(true)
    expect(tracker.nextSeq).toBe(11)
  })
})
