import { neutralLive2DMotionControlPose } from '@proj-airi/stage-ui-live2d/stores'
import { describe, expect, it, vi } from 'vitest'

import {
  createDefaultLive2DMotionTracks,
  createLive2DMotionRecordingFromTracks,
  createLive2DMotionTracksFromRecording,
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
    expect(pose.eyeSquint).toBe(0)
    expect(pose.mouthForm).toBe(0)
    expect(pose.mouthOpen).toBe(0)
    expect(pose.offsetX).toBe(0)
  })

  it('round-trips recorded motion through editable tracks', () => {
    const recording = {
      format: 'airi-live2d-motion/v6' as const,
      durationMs: 1000,
      samples: [
        { atMs: 0, ...neutralLive2DMotionControlPose },
        {
          atMs: 1000,
          ...neutralLive2DMotionControlPose,
          eyeSquint: 0.75,
          mouthForm: -0.5,
          mouthOpen: 1,
          offsetX: 0.25,
          offsetY: -0.5,
        },
      ],
    }

    const tracks = createLive2DMotionTracksFromRecording(recording)

    expect(tracks.eyeOpen.map(point => point.value)).toEqual([1, 0.25])
    expect(tracks.mouthForm.map(point => point.value)).toEqual([0, -0.5])
    expect(tracks.mouthOpen.map(point => point.value)).toEqual([0, 1])
    expect(createLive2DMotionRecordingFromTracks(tracks, recording.durationMs)).toEqual(recording)
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
