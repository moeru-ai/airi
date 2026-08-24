import type { Live2DMotionControlPose } from '@proj-airi/stage-ui-live2d/stores'

import { describe, expect, it, vi } from 'vitest'

import {
  parseLive2DMotionRecording,
  stringifyLive2DMotionRecording,
  useLive2DMotionRecording,
} from './live2d-motion-recording'

describe('live2D motion recording', () => {
  it('records changed poses with elapsed timestamps', () => {
    let now = 100
    const controller = useLive2DMotionRecording({
      applyPose: vi.fn(),
      releasePose: vi.fn(),
      now: () => now,
    })

    controller.startRecording({ x: 0, y: 0, headZ: 0, bodyZ: 0 })
    now = 125
    controller.recordPose({ x: 0.5, y: -0.25, headZ: -0.5, bodyZ: 0.75 })
    now = 175
    controller.recordPose({ x: 0.5, y: -0.25, headZ: -0.5, bodyZ: 0.75 })
    now = 200
    controller.recordPose({ x: 0, y: 0, headZ: 0, bodyZ: 0 })
    controller.stopRecording()

    expect(controller.recording.value).toEqual({
      format: 'airi-live2d-motion/v2',
      durationMs: 100,
      samples: [
        { atMs: 0, x: 0, y: 0, headZ: 0, bodyZ: 0 },
        { atMs: 25, x: 0.5, y: -0.25, headZ: -0.5, bodyZ: 0.75 },
        { atMs: 100, x: 0, y: 0, headZ: 0, bodyZ: 0 },
      ],
    })
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
      format: 'airi-live2d-motion/v2',
      durationMs: 200,
      samples: [
        { atMs: 0, x: 0, y: 0, headZ: 0, bodyZ: 0 },
        { atMs: 50, x: 0.5, y: 0.25, headZ: -0.5, bodyZ: 0.5 },
        { atMs: 150, x: -1, y: 1, headZ: 1, bodyZ: -1 },
      ],
    })))

    controller.startPlayback()
    expect(appliedPoses).toEqual([{ x: 0, y: 0, headZ: 0, bodyZ: 0 }])

    now = 1150
    nextFrame?.(now)
    expect(appliedPoses).toEqual([
      { x: 0, y: 0, headZ: 0, bodyZ: 0 },
      { x: 0.5, y: 0.25, headZ: -0.5, bodyZ: 0.5 },
      { x: -1, y: 1, headZ: 1, bodyZ: -1 },
    ])

    now = 1200
    nextFrame?.(now)
    expect(releasePose).toHaveBeenCalledOnce()
    expect(controller.status.value).toEqual({ type: 'idle' })
  })

  it('round-trips the versioned JSON format', () => {
    const recording = parseLive2DMotionRecording(JSON.stringify({
      format: 'airi-live2d-motion/v2',
      durationMs: 50,
      samples: [
        { atMs: 0, x: 0, y: 0, headZ: 0, bodyZ: 0 },
        { atMs: 50, x: 1, y: -1, headZ: -1, bodyZ: 1 },
      ],
    }))

    expect(parseLive2DMotionRecording(stringifyLive2DMotionRecording(recording))).toEqual(recording)
  })

  it('rejects samples outside the normalized joystick range', () => {
    expect(() => parseLive2DMotionRecording(JSON.stringify({
      format: 'airi-live2d-motion/v2',
      durationMs: 10,
      samples: [{ atMs: 0, x: 0, y: 0, headZ: 1.1, bodyZ: 0 }],
    }))).toThrow('The file is not an AIRI Live2D motion recording.')
  })

  it('rejects samples that are not in time order', () => {
    expect(() => parseLive2DMotionRecording(JSON.stringify({
      format: 'airi-live2d-motion/v2',
      durationMs: 20,
      samples: [
        { atMs: 0, x: 0, y: 0, headZ: 0, bodyZ: 0 },
        { atMs: 20, x: 1, y: 0, headZ: 0, bodyZ: 0 },
        { atMs: 10, x: 0, y: 0, headZ: 0, bodyZ: 0 },
      ],
    }))).toThrow('The motion samples must be in time order.')
  })
})
