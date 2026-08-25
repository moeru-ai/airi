import { describe, expect, it } from 'vitest'

import { getLive2DMotionControlModelOffset, neutralLive2DMotionControlPose } from './motion-control'

describe('getLive2DMotionControlModelOffset', () => {
  it('moves the model with the active joystick pose', () => {
    // ROOT CAUSE:
    //
    // The model offset used the normal cursor position instead of the manual
    // motion-control pose. Joystick recordings and playback did not move the
    // model because they only publish manual motion-control events.
    expect(getLive2DMotionControlModelOffset({
      active: true,
      pose: { ...neutralLive2DMotionControlPose, offsetX: 1, offsetY: 1 },
    })).toEqual({ x: 20, y: -40 })
  })

  it('does not offset the model after joystick release', () => {
    expect(getLive2DMotionControlModelOffset({
      active: false,
      pose: { ...neutralLive2DMotionControlPose, offsetX: 1, offsetY: 1 },
    })).toEqual({ x: 0, y: 0 })
  })
})
