import type { PresenceBubblePlacementMode } from './placement'

import { describe, expect, it } from 'vitest'

import { choosePresenceBubbleMode, resolvePresenceBubblePlacement } from './placement'

/**
 * A stage with the character low and centred, leaving room on every side.
 *
 * The gap is what the adapters pass: the tail's reach plus the clearance they
 * keep past its tip.
 */
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
    gap: 15,
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
    // ROOT CAUSE:
    //
    // This swayed the head where both sides had room to spare, so no sway could
    // change the answer, and it compared the result against a fresh call on the
    // resting box, which moved with it:
    //
    //   expect(mode).toBe(choosePresenceBubbleMode(atBoundary))
    //
    // Removing the band left both tests passing. The head now sways where the
    // right has between `bubbleWidth - switchHysteresis` and `bubbleWidth` of
    // room: enough to keep, not enough to take, and the left is roomier, so
    // without the band every frame would hand it to the left.
    const atBoundary = { ...roomyStage(), headY: 20, headX: 215 }

    let mode: PresenceBubblePlacementMode = 'right'
    const taken = new Set<PresenceBubblePlacementMode>()
    for (let frame = 0; frame < 12; frame++) {
      const swayed = { ...atBoundary, headX: 215 + (frame % 2 === 0 ? 2 : -2) }
      mode = choosePresenceBubbleMode(swayed, mode)
      taken.add(mode)
    }

    expect([...taken]).toEqual(['right'])
  })
})

describe('presence bubble placement', () => {
  it('stands clear of the head on the side it was sent to', () => {
    const stage = { ...roomyStage(), headY: 20 }
    const placement = resolvePresenceBubblePlacement(stage, 'right')

    expect(placement.x).toBeGreaterThanOrEqual(stage.headX + stage.headWidth)
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

    expect(placement.x).toBeGreaterThanOrEqual(0)
    expect(placement.x + narrow.bubbleWidth).toBeLessThanOrEqual(narrow.stageWidth)
    // A side placement sits a bubble's height above the head's crown, which on a
    // cramped stage is off the top of it.
    expect(placement.y).toBeGreaterThanOrEqual(0)
    expect(placement.y + narrow.bubbleHeight).toBeLessThanOrEqual(narrow.stageHeight)
  })

  it('centres the panel on the head when it sits above', () => {
    const stage = roomyStage()

    const placement = resolvePresenceBubblePlacement(stage, 'above')

    expect(placement.x + stage.bubbleWidth / 2).toBe(stage.headX + stage.headWidth / 2)
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
