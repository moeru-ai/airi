import { describe, expect, it } from 'vitest'

import {
  defaultLive2DBreathControlOptions,
  defaultLive2DMotionControlDynamics,
  getLive2DMotionControlModelOffset,
  neutralLive2DMotionControlPose,
  sampleLive2DBreath,
} from './motion-control'

describe('manual motion defaults', () => {
  it('uses the tuned joystick spring and breath duration', () => {
    expect(defaultLive2DMotionControlDynamics).toEqual({ follow: 1, inertia: 0.6 })
    expect(defaultLive2DBreathControlOptions.cycleSeconds).toBe(2)
  })
})

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

describe('sampleLive2DBreath', () => {
  it('uses sine-like inhale and exhale spans, then holds the exhaled state', () => {
    const options = {
      ...defaultLive2DBreathControlOptions,
      cycleSeconds: 4,
      exhaleDwellSeconds: 2,
      minimum: 0.1,
      maximum: 0.7,
      inhaleRatio: 0.25,
    }

    expect(sampleLive2DBreath(options, 0)).toMatchObject({ phase: 0, value: 0.1, stage: 'inhale' })
    expect(sampleLive2DBreath(options, 1)).toMatchObject({ phase: 1 / 6, value: 0.7, stage: 'exhale' })
    expect(sampleLive2DBreath(options, 2.5).value).toBeCloseTo(0.4)
    expect(sampleLive2DBreath(options, 4)).toMatchObject({ phase: 4 / 6, value: 0.1, stage: 'dwell' })
    expect(sampleLive2DBreath(options, 5.5)).toMatchObject({ phase: 5.5 / 6, value: 0.1, stage: 'dwell' })
    expect(sampleLive2DBreath(options, 6)).toMatchObject({ phase: 0, value: 0.1, stage: 'inhale' })
  })

  it('keeps the output inside the configured range', () => {
    const options = {
      ...defaultLive2DBreathControlOptions,
      cycleSeconds: 0,
      exhaleDwellSeconds: Number.POSITIVE_INFINITY,
      minimum: 0.8,
      maximum: 0.2,
      inhaleRatio: 1,
    }

    for (let elapsedSeconds = 0; elapsedSeconds < 30; elapsedSeconds += 0.1) {
      const sample = sampleLive2DBreath(options, elapsedSeconds)
      expect(sample.value).toBeGreaterThanOrEqual(0.8)
      expect(sample.value).toBeLessThanOrEqual(0.8)
    }
  })
})
