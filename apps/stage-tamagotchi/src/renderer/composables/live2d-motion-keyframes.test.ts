import { describe, expect, it, vi } from 'vitest'

import {
  createDefaultLive2DMotionTracks,
  evaluateLive2DMotionTracks,
  insertLive2DMotionKeyframe,
  moveLive2DMotionKeyframe,
} from './live2d-motion-keyframes'

describe('live2D motion keyframes', () => {
  it('evaluates each channel independently between points', () => {
    vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'point') })
    const tracks = createDefaultLive2DMotionTracks(1000)
    tracks.headX = [{ id: 'a', atMs: 0, value: -1 }, { id: 'b', atMs: 1000, value: 1 }]
    tracks.bodyY = [{ id: 'c', atMs: 0, value: 0 }, { id: 'd', atMs: 1000, value: 1 }]

    const pose = evaluateLive2DMotionTracks(tracks, 500)

    expect(pose.headX).toBe(0)
    expect(pose.bodyY).toBe(0.5)
    expect(pose.eyeX).toBe(0)
    expect(pose.offsetX).toBe(0)
  })

  it('keeps inserted and dragged points in timeline order', () => {
    const initial = [{ id: 'a', atMs: 0, value: 0 }, { id: 'b', atMs: 1000, value: 0 }]
    const inserted = insertLive2DMotionKeyframe(initial, { id: 'c', atMs: 500, value: 0.5 })
    const dragged = moveLive2DMotionKeyframe(inserted, 'c', 750, -0.5)

    expect(dragged).toEqual([
      { id: 'a', atMs: 0, value: 0 },
      { id: 'c', atMs: 750, value: -0.5 },
      { id: 'b', atMs: 1000, value: 0 },
    ])
  })

  it('allows a point to be removed by identity', () => {
    const points = [{ id: 'a', atMs: 0, value: 0 }, { id: 'b', atMs: 1000, value: 1 }]
    expect(points.filter(point => point.id !== 'a')).toEqual([{ id: 'b', atMs: 1000, value: 1 }])
  })
})
