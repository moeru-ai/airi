import { describe, expect, it } from 'vitest'

import { choosePresenceBubbleMode, presenceBubbleTailInset, resolvePresenceBubblePlacement } from './placement'

/** A stage with the character low and centred, leaving room on every side. */
function roomyStage() {
  return {
    stageWidth: 420,
    stageHeight: 560,
    headX: 150,
    headY: 160,
    headWidth: 120,
    headHeight: 140,
    bubbleWidth: 68,
    bubbleHeight: 55,
  }
}

describe('presence bubble mode', () => {
  it('takes the room above the head when there is any', () => {
    expect(choosePresenceBubbleMode(roomyStage())).toBe('above')
  })

  it('moves to the side with more room once the head reaches the top', () => {
    const cramped = { ...roomyStage(), headY: 20 }

    expect(choosePresenceBubbleMode(cramped)).toBe('right')
  })

  it('prefers the left when the character sits against the right edge', () => {
    const shifted = { ...roomyStage(), headY: 20, headX: 280 }

    expect(choosePresenceBubbleMode(shifted)).toBe('left')
  })

  it('returns to above once a resize gives the room back', () => {
    // ROOT CAUSE:
    //
    // The current mode was honoured before `above` was considered:
    //
    //   if (current && room(current) >= need(current) - hysteresis)
    //     return current
    //
    // A narrow window pinned the bubble aside for good. `above` is tested first
    // now.
    const cramped = { ...roomyStage(), headY: 20 }
    const restored = { ...roomyStage(), headY: 190 }

    const pushedAside = choosePresenceBubbleMode(cramped)
    expect(pushedAside).toBe('right')
    expect(choosePresenceBubbleMode(restored, pushedAside)).toBe('above')
  })

  it('holds its side while the head sways across the boundary', () => {
    // Breathing moves the head a few units per frame. Without a band between the
    // keep and take thresholds the bubble changes sides on alternate frames.
    const atBoundary = { ...roomyStage(), headY: 20, headX: 208, stageWidth: 420 }
    let mode = choosePresenceBubbleMode(atBoundary)

    for (let frame = 0; frame < 12; frame++) {
      const swayed = { ...atBoundary, headX: 208 + (frame % 2 === 0 ? 3 : -3) }
      mode = choosePresenceBubbleMode(swayed, mode)
    }

    expect(mode).toBe(choosePresenceBubbleMode(atBoundary))
  })
})

describe('presence bubble placement', () => {
  it('points the tail back at the head from the side it sits on', () => {
    const placement = resolvePresenceBubblePlacement({ ...roomyStage(), headY: 20 }, 'right')

    expect(placement.tailSide).toBe('left')
    expect(placement.x).toBeGreaterThan(roomyStage().headX)
  })

  it('keeps the whole bubble on stage when nothing fits', () => {
    const narrow = {
      ...roomyStage(),
      stageWidth: 120,
      stageHeight: 150,
      headX: 10,
      headY: 6,
      headWidth: 100,
      headHeight: 120,
    }

    const placement = resolvePresenceBubblePlacement(narrow, 'right')
    const left = placement.x - presenceBubbleTailInset

    expect(left).toBeGreaterThanOrEqual(0)
    expect(left + narrow.bubbleWidth).toBeLessThanOrEqual(narrow.stageWidth)
    expect(placement.y).toBeLessThanOrEqual(narrow.stageHeight)
  })

  it('reports coordinates from the box it is given, not from a settled one', () => {
    // The caller settles the box it decides with and passes the measured box
    // here, so the same mode has to track the head as it moves.
    const moved = { ...roomyStage(), headX: roomyStage().headX + 100 }

    const before = resolvePresenceBubblePlacement(roomyStage(), 'above')
    const after = resolvePresenceBubblePlacement(moved, 'above')

    expect(after.x - before.x).toBe(100)
  })
})
