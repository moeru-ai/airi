import { neutralLive2DMotionControlPose } from '@proj-airi/stage-ui-live2d/stores'
import { describe, expect, it } from 'vitest'

import {
  createLive2DMotionOverlay,
  createLive2DMotionProject,
  createLive2DMotionRecordingFromProject,
  cropLive2DMotionProject,
  evaluateLive2DMotionEyeView,
  evaluateLive2DMotionProject,
  insertLive2DMotionKeyframe,
  moveLive2DMotionKeyframe,
  parseLive2DMotionProject,
  stringifyLive2DMotionProject,
} from './keyframes'

function createRecording() {
  return {
    format: 'airi-live2d-motion/v6' as const,
    durationMs: 1000,
    samples: [
      { atMs: 0, ...neutralLive2DMotionControlPose },
      { atMs: 1000, ...neutralLive2DMotionControlPose, headY: 1, mouthOpen: 1 },
    ],
  }
}

describe('live2D motion overlays', () => {
  it('keeps the source intact and applies bounded overlays in order', () => {
    const source = createRecording()
    const project = createLive2DMotionProject(source)
    project.overlays = [
      { id: 'add', name: 'Add', trackId: 'headY', blendMode: 'add', weight: 0.5, startMs: 200, endMs: 800, points: [{ id: 'a', atMs: 200, value: 0.4 }, { id: 'b', atMs: 800, value: 0.4 }] },
      { id: 'replace', name: 'Replace', trackId: 'headY', blendMode: 'replace', weight: 0.5, startMs: 400, endMs: 600, points: [{ id: 'c', atMs: 400, value: -1 }, { id: 'd', atMs: 600, value: -1 }] },
    ]

    expect(project.source).toEqual(source)
    expect(evaluateLive2DMotionProject(project, 100).headY).toBeCloseTo(0.1)
    expect(evaluateLive2DMotionProject(project, 300).headY).toBeCloseTo(0.5)
    expect(evaluateLive2DMotionProject(project, 500).headY).toBeCloseTo(-0.15)
    expect(evaluateLive2DMotionProject(project, 900).headY).toBeCloseTo(0.9)
  })

  it('clamps the final composite to the target track range', () => {
    const project = createLive2DMotionProject(createRecording())
    project.overlays.push({ id: 'open', name: 'Open', trackId: 'mouthOpen', blendMode: 'add', weight: 1, startMs: 0, endMs: 1000, points: [{ id: 'a', atMs: 0, value: 1 }, { id: 'b', atMs: 1000, value: 1 }] })
    expect(evaluateLive2DMotionProject(project, 500).mouthOpen).toBe(1)
  })

  it('bakes source and overlay breakpoints into a v6 recording', () => {
    const project = createLive2DMotionProject(createRecording())
    project.overlays.push({ id: 'layer', name: 'Layer', trackId: 'headX', blendMode: 'add', weight: 1, startMs: 250, endMs: 750, points: [{ id: 'a', atMs: 250, value: 0 }, { id: 'b', atMs: 500, value: 1 }, { id: 'c', atMs: 750, value: 0 }] })

    const baked = createLive2DMotionRecordingFromProject(project)
    expect(baked.samples.map(sample => sample.atMs)).toEqual([0, 250, 500, 750, 1000])
    expect(baked.samples[2].headX).toBe(1)
  })

  it('holds sparse view targets without baking them into the pose recording', () => {
    const project = createLive2DMotionProject(createRecording())
    const overlay = createLive2DMotionOverlay('viewTargetX', 1000, 400, 'replace')
    overlay.points = [
      { id: 'a', atMs: 0, value: -0.4 },
      { id: 'b', atMs: 400, value: 0.6 },
      { id: 'c', atMs: 1000, value: 0.2 },
    ]
    project.overlays.push(overlay)

    expect(overlay).toMatchObject({ startMs: 0, endMs: 1000, blendMode: 'replace', weight: 1 })
    expect(evaluateLive2DMotionEyeView(project, 399)).toEqual({ x: -0.4 })
    expect(evaluateLive2DMotionEyeView(project, 400)).toEqual({ x: 0.6 })
    expect(evaluateLive2DMotionEyeView(project, 999)).toEqual({ x: 0.6 })
    expect(evaluateLive2DMotionEyeView(project, 1000)).toEqual({ x: 0.2 })
    expect(createLive2DMotionRecordingFromProject(project).samples.map(sample => sample.atMs)).toEqual([0, 1000])
  })

  it('crops source and overlays to interpolated boundary poses', () => {
    const project = createLive2DMotionProject({
      format: 'airi-live2d-motion/v6',
      durationMs: 1000,
      samples: [
        { atMs: 0, ...neutralLive2DMotionControlPose },
        { atMs: 500, ...neutralLive2DMotionControlPose, headY: 0.5 },
        { atMs: 1000, ...neutralLive2DMotionControlPose, headY: 1 },
      ],
    })
    project.overlays = [
      { id: 'inside', name: 'Inside', trackId: 'headX', blendMode: 'add', weight: 1, startMs: 200, endMs: 800, points: [{ id: 'a', atMs: 200, value: 0.4 }, { id: 'b', atMs: 800, value: 0.8 }] },
      { id: 'outside', name: 'Outside', trackId: 'headZ', blendMode: 'add', weight: 1, startMs: 0, endMs: 100, points: [{ id: 'c', atMs: 0, value: 1 }, { id: 'd', atMs: 100, value: 1 }] },
    ]

    const cropped = cropLive2DMotionProject(project, 250, 750)

    expect(cropped.durationMs).toBe(500)
    expect(cropped.source.durationMs).toBe(500)
    expect(cropped.source.samples.map(sample => sample.atMs)).toEqual([0, 250, 500])
    expect(cropped.source.samples.map(sample => sample.headY)).toEqual([0.25, 0.5, 0.75])
    expect(cropped.overlays).toHaveLength(1)
    expect(cropped.overlays[0]).toMatchObject({ id: 'inside', startMs: 0, endMs: 500 })
    expect(cropped.overlays[0].points.map(point => point.atMs)).toEqual([0, 500])
    expect(evaluateLive2DMotionProject(cropped, 0)).toEqual(evaluateLive2DMotionProject(project, 250))
    expect(evaluateLive2DMotionProject(cropped, 250)).toEqual(evaluateLive2DMotionProject(project, 500))
    expect(evaluateLive2DMotionProject(cropped, 500)).toEqual(evaluateLive2DMotionProject(project, 750))
    expect(project.durationMs).toBe(1000)
  })

  it('rejects an empty or out-of-bounds crop range', () => {
    const project = createLive2DMotionProject(createRecording())

    expect(() => cropLive2DMotionProject(project, 500, 500)).toThrow('outside the motion timeline')
    expect(() => cropLive2DMotionProject(project, -1, 500)).toThrow('outside the motion timeline')
    expect(() => cropLive2DMotionProject(project, 500, 1001)).toThrow('outside the motion timeline')
  })

  it('round-trips a project file with overlays', () => {
    const project = createLive2DMotionProject(createRecording())
    project.overlays.push({ id: 'layer', name: 'Layer', trackId: 'eyeOpen', blendMode: 'replace', weight: 0.75, startMs: 100, endMs: 900, points: [{ id: 'a', atMs: 100, value: 1 }, { id: 'b', atMs: 900, value: 0 }] })

    expect(parseLive2DMotionProject(stringifyLive2DMotionProject(project))).toEqual(project)
    expect(() => parseLive2DMotionProject('{"format":"wrong"}')).toThrow('not an AIRI Live2D motion project')
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
})
