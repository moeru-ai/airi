import { neutralPose } from '@proj-airi/model-driver-magic-live2d'
import { describe, expect, it } from 'vitest'

import {
  applyLive2DPoseAttention,
  createLive2DPoseAttention,
  live2DAttentionTargetFromModelPoint,
} from './pose-attention'

describe('applyLive2DPoseAttention', () => {
  it('turns the head part of the way and the eyes the rest', () => {
    const pose = applyLive2DPoseAttention(neutralPose, { x: 1, y: 0, weight: 1 }, { headGain: 0.5, bodyGain: 0.2 })

    expect(pose.headX).toBeCloseTo(0.5)
    expect(pose.bodyX).toBeCloseTo(0.2)
    expect(pose.eyeX).toBeCloseTo(0.5)
    expect(pose.headX + pose.eyeX).toBeCloseTo(1)
  })

  it('keeps the generated motion under the attention', () => {
    const generated = { ...neutralPose, headX: 0.1, headZ: 0.3, mouthForm: 0.4 }
    const pose = applyLive2DPoseAttention(generated, { x: 0.4, y: 0, weight: 1 }, { headGain: 0.5, bodyGain: 0 })

    expect(pose.headX).toBeCloseTo(0.3)
    expect(pose.headZ).toBe(0.3)
    expect(pose.mouthForm).toBe(0.4)
  })

  it('returns the same pose without weight', () => {
    const generated = { ...neutralPose, eyeX: 0.2 }
    expect(applyLive2DPoseAttention(generated, { x: 1, y: 1, weight: 0 })).toBe(generated)
  })
})

describe('createLive2DPoseAttention', () => {
  it('fades in toward a target and fades out after the target goes away', () => {
    const attention = createLive2DPoseAttention({ headGain: 0.5, bodyGain: 0, fadeSeconds: 0.2, followSeconds: 0.05 })

    for (let index = 0; index < 60; index += 1)
      attention.step({ x: 0.6, y: -0.2 }, 1 / 60)
    expect(attention.state().weight).toBeGreaterThan(0.99)
    expect(attention.state().x).toBeCloseTo(0.6)

    for (let index = 0; index < 120; index += 1)
      attention.step(undefined, 1 / 60)
    expect(attention.state().weight).toBe(0)
    expect(attention.apply(neutralPose)).toBe(neutralPose)
  })

  it('starts at the first target instead of sweeping from the center', () => {
    const attention = createLive2DPoseAttention()
    const state = attention.step({ x: -0.8, y: 0.3 }, 1 / 60)

    expect(state.x).toBeCloseTo(-0.8)
    expect(state.y).toBeCloseTo(0.3)
    expect(state.weight).toBeGreaterThan(0)
    expect(state.weight).toBeLessThan(0.1)
  })
})

describe('live2DAttentionTargetFromModelPoint', () => {
  it('keeps the distance inside the model and clamps it outside', () => {
    const size = { width: 1000, height: 1000 }

    expect(live2DAttentionTargetFromModelPoint({ x: 500, y: 500 }, size)).toEqual({ x: 0, y: 0 })
    expect(live2DAttentionTargetFromModelPoint({ x: 750, y: 250 }, size)).toEqual({ x: 0.5, y: 0.5 })

    const far = live2DAttentionTargetFromModelPoint({ x: 3000, y: 500 }, size)
    expect(far.x).toBeCloseTo(1)
    expect(far.y).toBeCloseTo(0)
  })
})
