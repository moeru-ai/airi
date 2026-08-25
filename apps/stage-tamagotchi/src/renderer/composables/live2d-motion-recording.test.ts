import type { Live2DMotionControlPose } from '@proj-airi/stage-ui-live2d/stores'

import { neutralLive2DMotionControlPose } from '@proj-airi/stage-ui-live2d/stores'
import { describe, expect, it, vi } from 'vitest'

import {
  parseLive2DMotionRecording,
  stringifyLive2DMotionRecording,
  useLive2DMotionRecording,
} from './live2d-motion-recording'

function pose(overrides: Partial<Live2DMotionControlPose> = {}): Live2DMotionControlPose {
  return { ...neutralLive2DMotionControlPose, ...overrides }
}

describe('live2D motion recording', () => {
  it('records changed poses with elapsed timestamps', () => {
    let now = 100
    const controller = useLive2DMotionRecording({
      applyPose: vi.fn(),
      releasePose: vi.fn(),
      now: () => now,
    })

    controller.startRecording()
    expect(controller.status.value).toEqual({ type: 'armed' })
    expect(controller.recording.value).toBeNull()

    now = 125
    controller.recordPose(pose({ headX: 0.5, headY: -0.25, headZ: -0.5, bodyZ: 0.75 }))
    expect(controller.recording.value).toEqual({
      format: 'airi-live2d-motion/v6',
      durationMs: 0,
      samples: [
        { atMs: 0, ...pose({ headX: 0.5, headY: -0.25, headZ: -0.5, bodyZ: 0.75 }) },
      ],
    })

    now = 150
    controller.recordPose(pose({ headX: 0.75, headY: -0.25, headZ: -0.5, bodyZ: 0.75 }))
    expect(controller.recording.value).toEqual({
      format: 'airi-live2d-motion/v6',
      durationMs: 25,
      samples: [
        { atMs: 0, ...pose({ headX: 0.5, headY: -0.25, headZ: -0.5, bodyZ: 0.75 }) },
        { atMs: 25, ...pose({ headX: 0.75, headY: -0.25, headZ: -0.5, bodyZ: 0.75 }) },
      ],
    })

    now = 175
    controller.recordPose(pose({ headX: 0.75, headY: -0.25, headZ: -0.5, bodyZ: 0.75 }))
    now = 200
    controller.recordPose(pose())
    controller.stopRecording()

    expect(controller.recording.value).toEqual({
      format: 'airi-live2d-motion/v6',
      durationMs: 75,
      samples: [
        { atMs: 0, ...pose({ headX: 0.5, headY: -0.25, headZ: -0.5, bodyZ: 0.75 }) },
        { atMs: 25, ...pose({ headX: 0.75, headY: -0.25, headZ: -0.5, bodyZ: 0.75 }) },
        { atMs: 75, ...pose() },
      ],
    })
  })

  it('keeps the existing recording when armed recording stops before input', () => {
    const controller = useLive2DMotionRecording({
      applyPose: vi.fn(),
      releasePose: vi.fn(),
    })
    const existing = parseLive2DMotionRecording(JSON.stringify({
      format: 'airi-live2d-motion/v6',
      durationMs: 50,
      samples: [{ atMs: 0, ...pose({ headX: 0.5 }) }],
    }))
    controller.loadRecording(existing)

    controller.startRecording()
    expect(controller.status.value).toEqual({ type: 'armed' })
    expect(controller.recording.value).toEqual(existing)

    controller.stopRecording()
    expect(controller.status.value).toEqual({ type: 'idle' })
    expect(controller.recording.value).toEqual(existing)
  })

  it('plays each due sample and releases control at the recording end', () => {
    let now = 1000
    let nextFrame: FrameRequestCallback | undefined
    const appliedPoses: Live2DMotionControlPose[] = []
    const releasePose = vi.fn()
    const controller = useLive2DMotionRecording({
      applyPose: pose => appliedPoses.push({ ...pose }),
      releasePose,
      now: () => now,
      requestFrame: (callback) => {
        nextFrame = callback
        return 1
      },
      cancelFrame: vi.fn(),
    })

    controller.loadRecording(parseLive2DMotionRecording(JSON.stringify({
      format: 'airi-live2d-motion/v6',
      durationMs: 200,
      samples: [
        { atMs: 0, ...pose() },
        { atMs: 50, ...pose({ headX: 0.5, headY: 0.25, headZ: -0.5, bodyZ: 0.5 }) },
        { atMs: 150, ...pose({ headX: -1, headY: 1, headZ: 1, bodyZ: -1 }) },
      ],
    })))

    controller.startPlayback()
    expect(appliedPoses).toEqual([pose()])

    now = 1150
    nextFrame?.(now)
    expect(appliedPoses).toEqual([
      pose(),
      pose({ headX: 0.5, headY: 0.25, headZ: -0.5, bodyZ: 0.5 }),
      pose({ headX: -1, headY: 1, headZ: 1, bodyZ: -1 }),
    ])

    now = 1200
    nextFrame?.(now)
    expect(releasePose).toHaveBeenCalledOnce()
    expect(controller.status.value).toEqual({ type: 'idle' })
  })

  it('round-trips the versioned JSON format', () => {
    const recording = parseLive2DMotionRecording(JSON.stringify({
      format: 'airi-live2d-motion/v6',
      durationMs: 50,
      samples: [
        { atMs: 0, ...pose() },
        { atMs: 50, ...pose({ headX: 1, headY: -1, headZ: -1, bodyZ: 1 }) },
      ],
    }))

    expect(parseLive2DMotionRecording(stringifyLive2DMotionRecording(recording))).toEqual(recording)
  })

  it('rejects samples outside the normalized joystick range', () => {
    expect(() => parseLive2DMotionRecording(JSON.stringify({
      format: 'airi-live2d-motion/v6',
      durationMs: 10,
      samples: [{ atMs: 0, ...pose({ headZ: 1.1 }) }],
    }))).toThrow('The file is not an AIRI Live2D motion recording.')
  })

  it('rejects samples that are not in time order', () => {
    expect(() => parseLive2DMotionRecording(JSON.stringify({
      format: 'airi-live2d-motion/v6',
      durationMs: 20,
      samples: [
        { atMs: 0, ...pose() },
        { atMs: 20, ...pose({ headX: 1 }) },
        { atMs: 10, ...pose() },
      ],
    }))).toThrow('The motion samples must be in time order.')
  })
})
