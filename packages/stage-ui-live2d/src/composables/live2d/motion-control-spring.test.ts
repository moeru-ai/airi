import type { Live2DMotionControlState } from '../../stores/motion-control'

import { describe, expect, it } from 'vitest'

import { neutralLive2DMotionControlPose } from '../../stores/motion-control'
import { createLive2DMotionSpring } from './motion-control-spring'

function createControl(overrides: Partial<Live2DMotionControlState> = {}): Live2DMotionControlState {
  return {
    active: true,
    ownerId: 'devtool',
    pose: { ...neutralLive2DMotionControlPose, headX: 1, headY: -0.5, headZ: 0.75, bodyZ: -1 },
    dynamics: { follow: 0.6, inertia: 0.35 },
    ...overrides,
  }
}

describe('live2D motion spring', () => {
  it('moves toward the joystick target without snapping to it', () => {
    const spring = createLive2DMotionSpring()

    const first = spring.step(createControl(), 1 / 60)

    expect(first.pose.headX).toBeGreaterThan(0)
    expect(first.pose.headX).toBeLessThan(1)
    expect(first.pose.headY).toBeLessThan(0)
    expect(first.pose.headY).toBeGreaterThan(-0.5)
  })

  it('uses follow to control how quickly the output approaches the target', () => {
    const slow = createLive2DMotionSpring()
    const fast = createLive2DMotionSpring()

    for (let frame = 0; frame < 12; frame += 1) {
      slow.step(createControl({ dynamics: { follow: 0.9, inertia: 0.35 } }), 1 / 60)
      fast.step(createControl({ dynamics: { follow: 1.8, inertia: 0.35 } }), 1 / 60)
    }

    expect(fast.output.value.pose.headX).toBeGreaterThan(slow.output.value.pose.headX)
  })

  it('uses inertia to preserve more movement after the target returns to center', () => {
    const lowInertia = createLive2DMotionSpring({ ...neutralLive2DMotionControlPose, headX: 1 })
    const highInertia = createLive2DMotionSpring({ ...neutralLive2DMotionControlPose, headX: 1 })

    lowInertia.step(createControl({ active: false, dynamics: { follow: 0.6, inertia: 0 } }), 1 / 30)
    highInertia.step(createControl({ active: false, dynamics: { follow: 0.6, inertia: 1 } }), 1 / 30)

    expect(highInertia.output.value.pose.headX).toBeGreaterThan(lowInertia.output.value.pose.headX)
  })

  it('settles at neutral after manual control is released', () => {
    const spring = createLive2DMotionSpring({ ...neutralLive2DMotionControlPose, headX: 1, headY: -1, headZ: 1, bodyZ: -1 })
    const released = createControl({ active: false })

    for (let frame = 0; frame < 600; frame += 1)
      spring.step(released, 1 / 60)

    expect(spring.output.value).toEqual({
      active: false,
      pose: neutralLive2DMotionControlPose,
    })
  })
})
