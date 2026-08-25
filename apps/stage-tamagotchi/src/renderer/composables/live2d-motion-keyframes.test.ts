import { neutralLive2DMotionControlPose } from '@proj-airi/stage-ui-live2d/stores'
import { describe, expect, it } from 'vitest'

import {
  createLive2DMotionProject,
  createLive2DMotionRecordingFromProject,
  evaluateLive2DMotionProject,
  insertLive2DMotionKeyframe,
  moveLive2DMotionKeyframe,
  parseLive2DMotionProject,
  stringifyLive2DMotionProject,
} from './live2d-motion-keyframes'

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
