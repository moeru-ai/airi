import { neutralPose } from '@proj-airi/model-driver-magic-live2d'
import { describe, expect, it } from 'vitest'

import { applyLive2DMotionViewTarget, defaultLive2DMotionViewTargetState } from './view-target'

describe('live2d motion view target', () => {
  it('keeps the generated eyes aimed forward while the head moves', () => {
    const pose = {
      ...neutralPose,
      headX: 0.4,
      headY: -0.25,
      eyeSquint: 0.5,
    }

    const output = applyLive2DMotionViewTarget(pose, defaultLive2DMotionViewTargetState)

    expect(output.eyeX).toBeCloseTo(-0.4)
    expect(output.eyeY).toBeCloseTo(0.25)
    expect(output.eyeSquint).toBe(0.5)
  })

  it('preserves the generated pose when the target is disabled', () => {
    const pose = { ...neutralPose, eyeX: 0.3, eyeY: -0.2 }

    expect(applyLive2DMotionViewTarget(pose, {
      ...defaultLive2DMotionViewTargetState,
      enabled: false,
    })).toBe(pose)
  })
})
