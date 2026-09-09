import { sampleScreenAmbientLight } from '@proj-airi/stage-shared/screen-ambient-light'
import { describe, expect, it } from 'vitest'

import { useStagePaintedMask } from './use-stage-painted-mask'

function scene() {
  const stage = document.createElement('canvas')
  stage.width = 320
  stage.height = 320
  const context = stage.getContext('2d')!
  const mask = useStagePaintedMask({ stageCanvas: () => stage, sampleGrid: () => ({ width: 32, height: 32 }), windowSize: () => ({ width: 320, height: 320 }) })
  const rectangle = { x: 0, y: 0, width: 1, height: 1 }
  const output = document.createElement('canvas')
  output.width = 32
  output.height = 32
  const capture = output.getContext('2d')!
  function pose(x: number) {
    context.clearRect(0, 0, 320, 320)
    context.fillStyle = '#fff'
    context.fillRect(x, 80, 100, 160)
  }
  function frame() {
    capture.fillStyle = '#101010'
    capture.fillRect(0, 0, 32, 32)
    capture.drawImage(stage, 0, 0, 32, 32)
    return capture.getImageData(0, 0, 32, 32)
  }
  function peak(image: ImageData, now: number) {
    const result = sampleScreenAmbientLight(image, { exclude: rectangle, displayAspect: 1, paintedAlpha: mask.maskFor(rectangle, now) })
    return Math.max(...result.environment.contact.data)
  }
  return { pose, frame, peak, mask, rectangle, context }
}

describe('capture feedback exclusion', () => {
  it('rejects a newly moved character on the next 50 ms capture', () => {
    // ROOT CAUSE:
    //
    // The 250 ms mask cache reused the previous pose while
    // 50 ms video samples already contained the newly painted white pixels.
    const s = scene()
    s.pose(80)
    expect(s.peak(s.frame(), 0)).toBeLessThan(0.006)
    s.pose(120)
    expect(s.peak(s.frame(), 50)).toBeLessThan(0.006)
  })

  it('rejects a delayed video pose even after the current silhouette moves', () => {
    // ROOT CAUSE:
    //
    // Capture and canvas do not share a presentation timestamp.
    // Keep recent painted coverage while the video can still contain it.
    const s = scene()
    s.pose(80)
    const delayed = s.frame()
    s.mask.maskFor(s.rectangle, 0)
    s.pose(120)
    expect(s.peak(delayed, 300)).toBeLessThan(0.006)
  })

  it('rejects the old window position while capture catches up with a move', () => {
    const s = scene()
    s.pose(80)
    s.mask.maskFor({ x: 0, y: 0, width: 0.5, height: 1 }, 0)
    const moved = { x: 0.5, y: 0, width: 0.5, height: 1 }
    const mask = s.mask.maskFor(moved, 100)
    const data = new Uint8ClampedArray(32 * 32 * 4)
    for (let y = 0; y < 32; y++) {
      for (let x = 0; x < 32; x++) {
        const white = x >= 4 && x < 9 && y >= 8 && y < 24
        data.set(white ? [255, 255, 255, 255] : [16, 16, 16, 255], (y * 32 + x) * 4)
      }
    }
    const result = sampleScreenAmbientLight({ width: 32, height: 32, data }, { exclude: moved, paintedAlpha: mask, displayAspect: 1 })
    expect(Math.max(...result.environment.contact.data)).toBeLessThan(0.006)
  })

  it('keeps faint halo edges excluded and releases old coverage', () => {
    const s = scene()
    s.context.fillStyle = 'rgba(255,255,255,0.01)'
    s.context.fillRect(80, 80, 100, 160)
    const alpha = s.mask.maskFor(s.rectangle, 0)!
    expect(alpha[12 * 32 + 12]).toBe(255)
    s.context.clearRect(0, 0, 320, 320)
    expect(s.mask.maskFor(s.rectangle, 300)![12 * 32 + 12]).toBe(255)
    expect(s.mask.maskFor(s.rectangle, 800)![12 * 32 + 12]).toBe(0)
    s.pose(80)
    s.mask.maskFor(s.rectangle, 900)
    s.mask.reset()
    s.context.clearRect(0, 0, 320, 320)
    expect(s.mask.maskFor(s.rectangle, 950)![12 * 32 + 12]).toBe(0)
  })
})
