import { describe, expect, it } from 'vitest'

import {
  createLive2DTouchGestureTracker,
  createLive2DTouchReaction,
  defaultLive2DTouchGestureOptions,
  findLive2DTouchMotionGroup,
  resolveLive2DTouchRegion,
} from './touch'

describe('resolveLive2DTouchRegion', () => {
  it('prefers the hit areas of the model author', () => {
    expect(resolveLive2DTouchRegion({ hitAreaNames: ['HitAreaHead'], insideHead: false, insideDrawable: true })).toBe('head')
    expect(resolveLive2DTouchRegion({ hitAreaNames: ['Body'], insideHead: true, insideDrawable: true })).toBe('body')
  })

  it('falls back to the head box and the drawables', () => {
    expect(resolveLive2DTouchRegion({ hitAreaNames: [], insideHead: true, insideDrawable: true })).toBe('head')
    expect(resolveLive2DTouchRegion({ hitAreaNames: [], insideHead: false, insideDrawable: true })).toBe('body')
    expect(resolveLive2DTouchRegion({ hitAreaNames: [], insideHead: false, insideDrawable: false })).toBeUndefined()
  })
})

describe('createLive2DTouchGestureTracker', () => {
  const head = { region: 'head' as const, side: 0.2 }
  const body = { region: 'body' as const, side: -0.1 }

  it('reports a short press as a tap on the pressed region', () => {
    const tracker = createLive2DTouchGestureTracker()
    tracker.down({ x: 10, y: 10, atMs: 0, hit: body })
    expect(tracker.move({ x: 12, y: 11, atMs: 50, hit: body })).toBeUndefined()
    expect(tracker.up({ x: 12, y: 11, atMs: 120, hit: body })).toEqual({ ...body, gesture: 'tap' })
  })

  it('ignores a drag and a long press', () => {
    const tracker = createLive2DTouchGestureTracker()
    tracker.down({ x: 0, y: 0, atMs: 0, hit: body })
    tracker.move({ x: 40, y: 0, atMs: 50, hit: body })
    expect(tracker.up({ x: 40, y: 0, atMs: 100, hit: body })).toBeUndefined()

    tracker.down({ x: 0, y: 0, atMs: 0, hit: body })
    expect(tracker.up({ x: 0, y: 0, atMs: 900, hit: body })).toBeUndefined()
  })

  /** Moves the tracker through points, and returns the pats. */
  function strokeOver(tracker: ReturnType<typeof createLive2DTouchGestureTracker>, points: readonly [number, number][]) {
    return points.map(([x, y], index) => tracker.move({ x, y, atMs: index * 16, hit: head })).filter(Boolean)
  }

  it('reports pats for a rub that goes back and forth over the head', () => {
    const tracker = createLive2DTouchGestureTracker({ ...defaultLive2DTouchGestureOptions, patTravel: 50 })
    tracker.down({ x: 0, y: 0, atMs: 0, hit: head })

    // Right 60 px, then left 60 px, then right 60 px: 180 px of travel with two reverses.
    const rub: [number, number][] = []
    for (let x = 10; x <= 60; x += 10) rub.push([x, 0])
    for (let x = 50; x >= 0; x -= 10) rub.push([x, 0])
    for (let x = 10; x <= 60; x += 10) rub.push([x, 0])
    const pats = strokeOver(tracker, rub)

    expect(pats.length).toBeGreaterThanOrEqual(2)
    expect(pats[0]).toEqual({ ...head, gesture: 'pat' })
    expect(tracker.up({ x: 60, y: 0, atMs: 400, hit: head })).toBeUndefined()
  })

  it('reports pats for a circle over the head', () => {
    const tracker = createLive2DTouchGestureTracker({ ...defaultLive2DTouchGestureOptions, patTravel: 50 })
    tracker.down({ x: 30, y: 0, atMs: 0, hit: head })

    // One turn of a circle with a 30 px radius, in 24 steps: about 188 px.
    const circle = Array.from({ length: 24 }, (_, index) => {
      const angle = (index + 1) / 24 * Math.PI * 2
      return [Math.cos(angle) * 30, Math.sin(angle) * 30] as [number, number]
    })

    expect(strokeOver(tracker, circle).length).toBeGreaterThanOrEqual(2)
  })

  it('reports no pat for a straight stroke across the head', () => {
    // ROOT CAUSE:
    //
    // Pats counted only the travel over the head, so a straight drag, for example
    // from the head down to the body, also patted the head.
    //
    // We fixed this by counting pats only after the stroke turns back.
    const tracker = createLive2DTouchGestureTracker()
    tracker.down({ x: 0, y: 0, atMs: 0, hit: head })

    const straight = Array.from({ length: 30 }, (_, index) => [0, (index + 1) * 10] as [number, number])

    expect(strokeOver(tracker, straight)).toEqual([])
  })

  it('ignores jitter shorter than one direction sample', () => {
    const tracker = createLive2DTouchGestureTracker({ ...defaultLive2DTouchGestureOptions, patTravel: 20 })
    tracker.down({ x: 0, y: 0, atMs: 0, hit: head })

    // A straight stroke with 2 px of sideways jitter on each step.
    const jittery = Array.from({ length: 40 }, (_, index) => [index % 2 === 0 ? 2 : -2, (index + 1) * 4] as [number, number])

    expect(strokeOver(tracker, jittery)).toEqual([])
  })

  it('does not start outside the character', () => {
    const tracker = createLive2DTouchGestureTracker()
    tracker.down({ x: 0, y: 0, atMs: 0, hit: undefined })
    expect(tracker.move({ x: 200, y: 0, atMs: 10, hit: head })).toBeUndefined()
    expect(tracker.up({ x: 200, y: 0, atMs: 20, hit: head })).toBeUndefined()
  })
})

describe('createLive2DTouchReaction', () => {
  it('rises, decays, and returns to zero', () => {
    const reaction = createLive2DTouchReaction()
    reaction.trigger({ region: 'head', gesture: 'tap', side: 1 }, 10)

    expect(reaction.sample(10).angleY).toBe(0)
    const peak = reaction.sample(10.05)
    expect(peak.angleY).toBeCloseTo(-7)
    expect(peak.angleZ).toBeCloseTo(6)
    expect(peak.eyeSquint).toBeGreaterThan(0.4)
    expect(Math.abs(reaction.sample(10.6).angleY)).toBeLessThan(Math.abs(peak.angleY))
    expect(reaction.sample(20)).toEqual({ angleX: 0, angleY: 0, angleZ: 0, bodyAngleX: 0, bodyAngleY: 0, eyeSquint: 0 })
  })

  it('bounds overlapping pats', () => {
    const reaction = createLive2DTouchReaction()
    for (let index = 0; index < 20; index += 1)
      reaction.trigger({ region: 'head', gesture: 'pat', side: 1 }, 1 + index * 0.01)

    const offsets = reaction.sample(1.35)
    expect(offsets.angleZ).toBeLessThanOrEqual(14)
    expect(offsets.eyeSquint).toBeLessThanOrEqual(0.8)
  })
})

describe('findLive2DTouchMotionGroup', () => {
  it('matches the common names of the touch groups', () => {
    expect(findLive2DTouchMotionGroup(['Idle', 'TapBody'], 'body')).toBe('TapBody')
    expect(findLive2DTouchMotionGroup(['idle', 'tap_body'], 'body')).toBe('tap_body')
    expect(findLive2DTouchMotionGroup(['Idle', 'Tap@Head'], 'head')).toBe('Tap@Head')
    expect(findLive2DTouchMotionGroup(['Idle'], 'head')).toBeUndefined()
  })
})
