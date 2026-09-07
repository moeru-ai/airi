import type { TrainingSequence } from './index'

import { describe, expect, it } from 'vitest'

import { fit } from './index'

const eyeXIndex = 0
const headXIndex = 3
const headYIndex = 4
const mouthOpenIndex = 10

function createTrainingSequence(): TrainingSequence {
  const sampleRateHz = 30
  const frames = Array.from({ length: 240 }, (_, frame) => {
    const regime = Math.floor(frame / 60) % 2
    const phase = (frame % 60) / 60 * Math.PI * 2
    const headX = Math.sin(phase) * (regime === 0 ? 0.25 : 0.7)
    const headY = Math.cos(phase * 0.5) * (regime === 0 ? 0.2 : 0.55)
    return [
      headX,
      0,
      0,
      headX,
      headY,
      0,
      headX * 0.4,
      headY * 0.3,
      0,
      0,
      (Math.sin(phase * 2) + 1) * (regime === 0 ? 0.1 : 0.35),
      0,
      0,
    ]
  })

  return {
    sampleRateHz,
    sourceDurationMs: (frames.length - 1) / sampleRateHz * 1000,
    frames,
  }
}

describe('var motion model', () => {
  it('folds duplicate tracks and creates deterministic seeded predictions', () => {
    const model = fit(createTrainingSequence(), {
      method: 'var',
      order: 4,
      ridge: 0.001,
    })
    const left = model.toGenerator({ seed: 42 })
    const right = model.toGenerator({ seed: 42 })

    const leftFrames = Array.from({ length: 8 }, () => left.next({ noiseScale: 1 }))
    const rightFrames = Array.from({ length: 8 }, () => right.next({ noiseScale: 1 }))

    expect(model.diagnostics.sourceFrameCount).toBe(240)
    expect(leftFrames).toEqual(rightFrames)
    expect(leftFrames.every(frame => frame.values[eyeXIndex] === frame.values[headXIndex])).toBe(true)
    expect(leftFrames.slice(0, 3).map(frame => [
      frame.values[headXIndex],
      frame.values[headYIndex],
      frame.values[mouthOpenIndex],
    ])).toEqual([
      [0.12799432561135884, 0.054573315614377164, 0.024153378051292806],
      [0.10509858715154652, 0.03374690235924656, 0.056620804071637526],
      [0.08510790150474039, 0.04028754800254499, 0.07558465056506322],
    ])
  })

  it('changes the generated stream when the seed changes', () => {
    const model = fit(createTrainingSequence(), {
      method: 'var',
      order: 4,
      ridge: 0.001,
    })
    const first = model.toGenerator({ seed: 1 }).next({ noiseScale: 1 })
    const second = model.toGenerator({ seed: 2 }).next({ noiseScale: 1 })

    expect(first.values).not.toEqual(second.values)
  })
})

describe('ar-hmm motion model', () => {
  it('fits normalized state probabilities and creates deterministic seeded predictions', () => {
    const model = fit(createTrainingSequence(), {
      method: 'ar-hmm',
      stateCount: 2,
      order: 2,
      ridge: 0.003,
      iterations: 3,
    })
    const left = model.toGenerator({ seed: 42 })
    const right = model.toGenerator({ seed: 42 })

    const leftFrames = Array.from({ length: 8 }, () => left.next({ noiseScale: 0.8 }))
    const rightFrames = Array.from({ length: 8 }, () => right.next({ noiseScale: 0.8 }))

    expect(model.diagnostics.stateCount).toBe(2)
    expect(model.diagnostics.stateOccupancy.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1)
    expect(leftFrames).toEqual(rightFrames)
    expect(leftFrames.every(frame => frame.state >= 0 && frame.state < 2)).toBe(true)
    expect(leftFrames.slice(0, 3).map(frame => [
      frame.values[headXIndex],
      frame.values[headYIndex],
      frame.values[mouthOpenIndex],
      frame.state,
    ])).toEqual([
      [0.13943473079372, 0.06070498660996517, 0.020640206789858145, 0],
      [0.11433926174359062, 0.06803350647613264, 0.04315048588173365, 0],
      [0.08294112596838775, 0.03427563830236432, 0.07306459062250431, 0],
    ])
  })
})
