import type { Live2DMotionTrainingSequence } from './index'

import { describe, expect, it } from 'vitest'

import { createArHmmMotionPredictor, fitArHmmMotionModel } from './ar-hmm'
import { neutralLive2DMotionPose } from './index'
import { createVarMotionPredictor, fitVarMotionModel } from './var'

function createTrainingSequence(): Live2DMotionTrainingSequence {
  const sampleRateHz = 30
  const poses = Array.from({ length: 240 }, (_, frame) => {
    const regime = Math.floor(frame / 60) % 2
    const phase = (frame % 60) / 60 * Math.PI * 2
    const headX = Math.sin(phase) * (regime === 0 ? 0.25 : 0.7)
    const headY = Math.cos(phase * 0.5) * (regime === 0 ? 0.2 : 0.55)
    return {
      ...neutralLive2DMotionPose,
      eyeX: headX,
      headX,
      headY,
      bodyX: headX * 0.4,
      bodyY: headY * 0.3,
      mouthOpen: (Math.sin(phase * 2) + 1) * (regime === 0 ? 0.1 : 0.35),
    }
  })

  return {
    sampleRateHz,
    sourceDurationMs: (poses.length - 1) / sampleRateHz * 1000,
    poses,
  }
}

describe('var motion model', () => {
  it('folds duplicate tracks and creates deterministic seeded predictions', () => {
    const model = fitVarMotionModel(createTrainingSequence(), {
      order: 4,
      ridge: 0.001,
    })
    const left = createVarMotionPredictor(model, { seed: 42 })
    const right = createVarMotionPredictor(model, { seed: 42 })

    const leftFrames = Array.from({ length: 8 }, () => left.next({ noiseScale: 1 }))
    const rightFrames = Array.from({ length: 8 }, () => right.next({ noiseScale: 1 }))

    expect(model.sourceFrameCount).toBe(240)
    expect(model.channels.some(channel => (
      channel.trackIds.includes('eyeX') && channel.trackIds.includes('headX')
    ))).toBe(true)
    expect(leftFrames).toEqual(rightFrames)
    expect(leftFrames.every(frame => frame.pose.eyeX === frame.pose.headX)).toBe(true)
    expect(leftFrames.slice(0, 3).map(frame => [
      frame.pose.headX,
      frame.pose.headY,
      frame.pose.mouthOpen,
    ])).toEqual([
      [0.12799432561135884, 0.054573315614377164, 0.024153378051292806],
      [0.10509858715154652, 0.03374690235924656, 0.056620804071637526],
      [0.08510790150474039, 0.04028754800254499, 0.07558465056506322],
    ])
  })

  it('changes the generated stream when the seed changes', () => {
    const model = fitVarMotionModel(createTrainingSequence(), {
      order: 4,
      ridge: 0.001,
    })
    const first = createVarMotionPredictor(model, { seed: 1 }).next({ noiseScale: 1 })
    const second = createVarMotionPredictor(model, { seed: 2 }).next({ noiseScale: 1 })

    expect(first.pose).not.toEqual(second.pose)
  })
})

describe('ar-hmm motion model', () => {
  it('fits normalized state probabilities and creates deterministic seeded predictions', () => {
    const model = fitArHmmMotionModel(createTrainingSequence(), {
      stateCount: 2,
      order: 2,
      ridge: 0.003,
      iterations: 3,
    })
    const left = createArHmmMotionPredictor(model, { seed: 42 })
    const right = createArHmmMotionPredictor(model, { seed: 42 })

    const leftFrames = Array.from({ length: 8 }, () => left.next({ noiseScale: 0.8 }))
    const rightFrames = Array.from({ length: 8 }, () => right.next({ noiseScale: 0.8 }))

    expect(model.transitionProbabilities).toHaveLength(2)
    for (const probabilities of model.transitionProbabilities)
      expect(probabilities.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1)
    expect(leftFrames).toEqual(rightFrames)
    expect(leftFrames.every(frame => frame.state >= 0 && frame.state < 2)).toBe(true)
    expect(leftFrames.slice(0, 3).map(frame => [
      frame.pose.headX,
      frame.pose.headY,
      frame.pose.mouthOpen,
      frame.state,
    ])).toEqual([
      [0.13943473079372, 0.06070498660996517, 0.020640206789858145, 0],
      [0.11433926174359062, 0.06803350647613264, 0.04315048588173365, 0],
      [0.08294112596838775, 0.03427563830236432, 0.07306459062250431, 0],
    ])
  })
})
