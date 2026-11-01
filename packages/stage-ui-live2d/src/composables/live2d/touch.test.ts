import { describe, expect, it } from 'vitest'

import {
  createLive2DTouchGestureTracker,
  createLive2DTouchReaction,
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

  it('reports one pat for each stroke length over the head', () => {
    const tracker = createLive2DTouchGestureTracker({ tapMaxTravel: 8, tapMaxDurationMs: 450, patTravel: 50 })
    tracker.down({ x: 0, y: 0, atMs: 0, hit: head })

    const pats = [30, 60, 90, 120, 150].map((x, index) => tracker.move({ x, y: 0, atMs: index * 16, hit: head }))
    expect(pats.filter(Boolean)).toHaveLength(2)
    expect(pats.find(Boolean)).toEqual({ ...head, gesture: 'pat' })
    expect(tracker.up({ x: 150, y: 0, atMs: 100, hit: head })).toBeUndefined()
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
