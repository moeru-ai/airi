import { describe, expect, it } from 'vitest'
import { shallowRef } from 'vue'

import { PlacementGestures } from './placement-gestures'

/** Creates an editor session with the same reactive values as the mobile rulers. */
function createSession() {
  const scale = shallowRef(1)
  const position = shallowRef({ x: 0, y: 0 })
  const gestures = new PlacementGestures(scale, position)
  return { scale, position, gestures }
}

describe('placement gestures', () => {
  it('preserves single-finger movement in stage percentages', () => {
    const { position, scale, gestures } = createSession()
    gestures.start({ pointerId: 1, clientX: 100, clientY: 100 }, { width: 200, height: 400 })
    gestures.move({ pointerId: 1, clientX: 150, clientY: 140 })
    expect(position.value).toEqual({ x: 25, y: -10 })
    expect(scale.value).toBe(1)
  })

  it('zooms in and out without moving the model or accumulating scale drift', () => {
    const { position, scale, gestures } = createSession()
    gestures.start({ pointerId: 1, clientX: 100, clientY: 100 }, { width: 200, height: 400 })
    gestures.start({ pointerId: 2, clientX: 200, clientY: 100 }, { width: 200, height: 400 })
    gestures.move({ pointerId: 2, clientX: 250, clientY: 100 })
    expect(scale.value).toBe(1.5)
    gestures.move({ pointerId: 2, clientX: 150, clientY: 100 })
    expect(scale.value).toBe(0.5)
    expect(position.value).toEqual({ x: 0, y: 0 })
  })

  it('uses diagonal distance and clamps scale to the ruler limits', () => {
    const { scale, gestures } = createSession()
    gestures.start({ pointerId: 1, clientX: 0, clientY: 0 }, { width: 200, height: 400 })
    gestures.start({ pointerId: 2, clientX: 30, clientY: 40 }, { width: 200, height: 400 })
    gestures.move({ pointerId: 2, clientX: 300, clientY: 400 })
    expect(scale.value).toBe(3)
    gestures.move({ pointerId: 2, clientX: 0, clientY: 0 })
    expect(scale.value).toBe(0.1)
  })

  it('resumes movement after a pinch without jumping to the first drag origin', () => {
    const { position, scale, gestures } = createSession()
    gestures.start({ pointerId: 1, clientX: 100, clientY: 100 }, { width: 200, height: 400 })
    gestures.move({ pointerId: 1, clientX: 120, clientY: 100 })
    gestures.start({ pointerId: 2, clientX: 220, clientY: 100 }, { width: 200, height: 400 })
    gestures.move({ pointerId: 1, clientX: 100, clientY: 100 })
    expect(scale.value).toBe(1.2)
    expect(position.value.x).toBe(10)
    gestures.end(2)
    gestures.move({ pointerId: 1, clientX: 110, clientY: 100 })
    expect(position.value.x).toBe(15)
    expect(scale.value).toBe(1.2)
  })

  it('uses a ruler change as the next pinch baseline', () => {
    const { scale, gestures } = createSession()
    scale.value = 2
    gestures.start({ pointerId: 1, clientX: 0, clientY: 0 }, { width: 200, height: 400 })
    gestures.start({ pointerId: 2, clientX: 100, clientY: 0 }, { width: 200, height: 400 })
    gestures.move({ pointerId: 2, clientX: 75, clientY: 0 })
    expect(scale.value).toBe(1.5)
  })

  it('ignores stale pointers after cancellation and suspends input with three fingers', () => {
    const { position, scale, gestures } = createSession()
    gestures.start({ pointerId: 1, clientX: 0, clientY: 0 }, { width: 200, height: 400 })
    gestures.start({ pointerId: 2, clientX: 100, clientY: 0 }, { width: 200, height: 400 })
    gestures.start({ pointerId: 3, clientX: 150, clientY: 0 }, { width: 200, height: 400 })
    gestures.move({ pointerId: 2, clientX: 200, clientY: 0 })
    expect(scale.value).toBe(1)
    expect(position.value).toEqual({ x: 0, y: 0 })
    gestures.end(3)
    gestures.move({ pointerId: 2, clientX: 100, clientY: 0 })
    expect(scale.value).toBe(0.5)
    gestures.reset()
    gestures.move({ pointerId: 2, clientX: 300, clientY: 0 })
    expect(scale.value).toBe(0.5)
  })
})
