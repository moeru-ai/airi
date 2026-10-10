import type { FramingLens, MotionFramingFrame, MotionFramingResult } from './motion-framing'

import { Box3, Matrix4, PerspectiveCamera, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'

import { combineMotionEnvelopes, MotionFramingController, solvePerspectiveFraming, transformMotionEnvelope } from './motion-framing'

const lens: FramingLens = { verticalFovDegrees: 50, aspect: 1, zoom: 1, near: 0.01, far: 1000 }

function box(x: number, y = x, depth = 0.1) {
  return new Box3(new Vector3(-x, -y, -depth), new Vector3(x, y, depth))
}

function cameraBox(x: number, y = x, depth = 0.1) {
  return box(x, y, depth).translate(new Vector3(0, 0, -5))
}

function ready(result: MotionFramingResult) {
  expect(result.status).toBe('ready')
  if (result.status !== 'ready')
    throw new Error('Expected a framing proposal')
  return result.solution
}

function frame(overrides: Partial<MotionFramingFrame> = {}): MotionFramingFrame {
  return {
    modelId: 'model-instance-1',
    motionRevision: 0,
    cameraRevision: 0,
    nowMs: 0,
    manualControl: false,
    motionEnvelope: box(1),
    liveBounds: box(1),
    modelToBaselineCamera: new Matrix4().makeTranslation(0, 0, -5),
    anchor: new Vector3(0, 0, 0),
    lens,
    ...overrides,
  }
}

function expectProjectedInside(bounds: Box3, offset: Vector3, view: FramingLens, margin: number) {
  const camera = new PerspectiveCamera(view.verticalFovDegrees, view.aspect, view.near, view.far)
  camera.zoom = view.zoom
  camera.position.copy(offset)
  camera.updateProjectionMatrix()
  camera.updateMatrixWorld(true)
  for (const x of [bounds.min.x, bounds.max.x]) {
    for (const y of [bounds.min.y, bounds.max.y]) {
      for (const z of [bounds.min.z, bounds.max.z]) {
        const projected = new Vector3(x, y, z).project(camera)
        expect(Math.abs(projected.x)).toBeLessThanOrEqual(1 - margin + 1e-9)
        expect(Math.abs(projected.y)).toBeLessThanOrEqual(1 - margin + 1e-9)
        expect(projected.z).toBeGreaterThanOrEqual(-1 - 1e-9)
        expect(projected.z).toBeLessThanOrEqual(1 + 1e-9)
      }
    }
  }
}

describe('motion envelopes', () => {
  it('unions metadata, samples, accessories, and live geometry without mutating sources', () => {
    const body = box(1)
    const hair = new Box3(new Vector3(-0.2, 1, -0.2), new Vector3(0.2, 4, 0.2))
    const skirt = box(3, 0.5)
    const combined = combineMotionEnvelopes([body, hair, undefined, skirt])!
    expect(combined.min.x).toBe(-3)
    expect(combined.max.y).toBe(4)
    expect(body.max.x).toBe(1)
    combined.max.x = 100
    expect(skirt.max.x).toBe(3)
  })

  it('ignores inverted, empty, infinite, NaN, and numeric-overflow envelopes', () => {
    const inverted = new Box3(new Vector3(2, 2, 2), new Vector3(1, 1, 1))
    const nan = new Box3(new Vector3(Number.NaN, 0, 0), new Vector3(1, 1, 1))
    expect(combineMotionEnvelopes([new Box3(), inverted, nan, box(Infinity), box(1e20)])).toBeUndefined()
    expect(combineMotionEnvelopes([nan, box(2)])!.max.x).toBe(2)
  })

  it('handles rotated, translated, mirrored, and nonuniformly scaled models', () => {
    const transform = new Matrix4().makeRotationZ(Math.PI / 2).scale(new Vector3(-3, 0.5, 2)).setPosition(4, -2, -10)
    const original = box(1, 2, 0.5)
    const transformed = transformMotionEnvelope(original, transform)!
    expect(transformed.min.x).toBeCloseTo(3)
    expect(transformed.max.x).toBeCloseTo(5)
    expect(transformed.min.y).toBeCloseTo(-5)
    expect(transformed.max.y).toBeCloseTo(1)
    expect(transformed.min.z).toBeCloseTo(-11)
    expect(original.max.x).toBe(1)
  })

  it('rejects singular and projective transforms without producing bad bounds', () => {
    expect(transformMotionEnvelope(box(1), new Matrix4().makeScale(0, 1, 1))).toBeUndefined()
    expect(transformMotionEnvelope(box(1), new PerspectiveCamera().projectionMatrix)).toBeUndefined()
    expect(transformMotionEnvelope(box(1), new Matrix4().makeTranslation(Infinity, 0, 0))).toBeUndefined()
  })
})

describe('perspective framing', () => {
  it.each([0.01, 1, 100])('fits nonstandard model scale %s without changing proportions', (scale) => {
    const bounds = cameraBox(4, 6).applyMatrix4(new Matrix4().makeScale(scale, scale, scale))
    const anchor = new Vector3(0, 0, -5 * scale)
    const view = { ...lens, far: lens.far * Math.max(1, scale) }
    const solution = solvePerspectiveFraming({ bounds, anchor, lens: view })!
    expect(solution.fits).toBe(true)
    expect(solution.factor).toBeCloseTo(2.8793416175, 5)
    expectProjectedInside(bounds, solution.cameraOffset, view, 0.1)
  })

  it.each([0.3, 0.5625, 1, 16 / 9, 3])('fits portrait and wide aspect ratio %s', (aspect) => {
    const view = { ...lens, aspect }
    const bounds = cameraBox(2, 3)
    const solution = solvePerspectiveFraming({ bounds, anchor: new Vector3(0, 0, -5), lens: view, maxZoomOut: 8 })!
    expect(solution.fits).toBe(true)
    expectProjectedInside(bounds, solution.cameraOffset, view, 0.1)
  })

  it('preserves an off-center anchor exactly with a dolly and matching camera-plane translation', () => {
    const anchor = new Vector3(0.6, -0.7, -5)
    const bounds = cameraBox(4, 3)
    const solution = solvePerspectiveFraming({ bounds, anchor, lens })!
    const moved = anchor.clone().sub(solution.cameraOffset)
    expect(moved.x / -moved.z).toBeCloseTo(anchor.x / -anchor.z, 12)
    expect(moved.y / -moved.z).toBeCloseTo(anchor.y / -anchor.z, 12)
    expect(solution.fits).toBe(true)
    expectProjectedInside(bounds, solution.cameraOffset, lens, 0.1)
  })

  it('uses the user lens zoom rather than assuming its default', () => {
    const view = { ...lens, zoom: 1.8 }
    const bounds = cameraBox(3, 3)
    const solution = solvePerspectiveFraming({ bounds, anchor: new Vector3(0, 0, -5), lens: view })!
    expect(solution.fits).toBe(true)
    expectProjectedInside(bounds, solution.cameraOffset, view, 0.1)
  })

  it('caps oversized envelopes and reports remaining clipping', () => {
    const solution = solvePerspectiveFraming({ bounds: cameraBox(100), anchor: new Vector3(0, 0, -5), lens, maxZoomOut: 3 })!
    expect(solution.factor).toBe(3)
    expect(solution.fits).toBe(false)
    expect(solution.limited).toBe(true)
    expect(solution.cameraOffset.z).toBe(10)
  })

  it('fits bounds crossing the near plane without projecting behind-camera corners', () => {
    const bounds = new Box3(new Vector3(-1, -1, -3), new Vector3(1, 1, 1))
    const solution = solvePerspectiveFraming({ bounds, anchor: new Vector3(0, 0, -5), lens })!
    expect(solution.fits).toBe(true)
    expectProjectedInside(bounds, solution.cameraOffset, lens, 0.1)
  })

  it('respects the far plane without expanding the clipping range', () => {
    const solution = solvePerspectiveFraming({ bounds: cameraBox(5), anchor: new Vector3(0, 0, -5), lens: { ...lens, far: 6 } })!
    expect(solution.factor).toBeCloseTo(1.18)
    expect(solution.fits).toBe(false)
    expect(solution.limited).toBe(true)
  })

  it('rejects missing geometry, malformed lenses, and anchors outside the safe viewport', () => {
    expect(solvePerspectiveFraming({ bounds: new Box3(), anchor: new Vector3(0, 0, -5), lens })).toBeUndefined()
    expect(solvePerspectiveFraming({ bounds: cameraBox(2), anchor: new Vector3(0, 0, -5), lens: { ...lens, aspect: 0 } })).toBeUndefined()
    expect(solvePerspectiveFraming({ bounds: cameraBox(2), anchor: new Vector3(100, 0, -5), lens })).toBeUndefined()
    expect(solvePerspectiveFraming({ bounds: cameraBox(2), anchor: new Vector3(0, 0, 1), lens })).toBeUndefined()
    expect(solvePerspectiveFraming({ bounds: cameraBox(2), anchor: new Vector3(Number.NaN, 0, -5), lens })).toBeUndefined()
  })
})

describe('framing ownership and hysteresis', () => {
  it('grows immediately and never compounds offsets across repeated frames', () => {
    const controller = new MotionFramingController('model-instance-1')
    const initial = ready(controller.update(frame({ motionEnvelope: box(4) })))
    expect(initial.factor).toBeGreaterThan(1)
    for (let i = 1; i <= 100; i++) {
      const next = ready(controller.update(frame({ nowMs: i * 16, motionEnvelope: box(4) })))
      expect(next.factor).toBe(initial.factor)
      expect(next.cameraOffset.equals(initial.cameraOffset)).toBe(true)
    }
  })

  it('retains crossfade bounds, then waits before shrinking at a bounded rate', () => {
    const controller = new MotionFramingController('model-instance-1', { transitionHoldMs: 400, shrinkDelayMs: 500, shrinkRate: 1 })
    const large = ready(controller.update(frame({ motionEnvelope: box(4) })))
    const small = frame({ motionRevision: 1, nowMs: 100 })
    expect(ready(controller.update(small)).factor).toBe(large.factor)
    expect(ready(controller.update({ ...small, nowMs: 499 })).factor).toBe(large.factor)
    expect(ready(controller.update({ ...small, nowMs: 500 })).factor).toBe(large.factor)
    expect(ready(controller.update({ ...small, nowMs: 999 })).factor).toBe(large.factor)
    const shrinking = ready(controller.update({ ...small, nowMs: 1000 }))
    expect(shrinking.factor).toBeLessThan(large.factor)
    expect(shrinking.factor).toBeGreaterThanOrEqual(large.factor - 0.1)
  })

  it('keeps all rapid replacements conservative and rejects stale sampled results', () => {
    const controller = new MotionFramingController('model-instance-1')
    const large = ready(controller.update(frame({ motionEnvelope: box(6) })))
    for (let i = 1; i < 30; i++) {
      expect(ready(controller.update(frame({ motionRevision: i, nowMs: i * 5 }))).factor).toBe(large.factor)
    }
    expect(controller.update(frame({ motionRevision: 10, nowMs: 200, motionEnvelope: box(100) })).status).toBe('stale')
    expect(ready(controller.update(frame({ motionRevision: 29, nowMs: 201 }))).factor).toBe(large.factor)
  })

  it('uses live hair or accessory bounds beyond a selected motion envelope', () => {
    const controller = new MotionFramingController('model-instance-1')
    const guarded = ready(controller.update(frame({ liveBounds: box(5, 1) })))
    expect(guarded.factor).toBeGreaterThan(2)
    expect(guarded.fits).toBe(true)
  })

  it('settles fully to baseline after shrink hysteresis opens', () => {
    const controller = new MotionFramingController('model-instance-1', { transitionHoldMs: 0, shrinkDelayMs: 0, shrinkRate: 1 })
    ready(controller.update(frame({ motionEnvelope: box(4) })))
    let factor = 4
    for (let i = 1; i <= 100; i++) {
      factor = ready(controller.update(frame({ motionRevision: 1, nowMs: i * 100 }))).factor
    }
    expect(factor).toBe(1)
  })

  it('does not shrink while live bounds are missing or invalid', () => {
    const controller = new MotionFramingController('model-instance-1', { transitionHoldMs: 0, shrinkDelayMs: 0 })
    const grown = ready(controller.update(frame({ motionEnvelope: box(4) }))).factor
    expect(ready(controller.update(frame({ motionRevision: 1, nowMs: 1000, liveBounds: undefined }))).factor).toBe(grown)
    expect(ready(controller.update(frame({ motionRevision: 1, nowMs: 2000, liveBounds: box(Number.NaN) }))).factor).toBe(grown)
  })

  it('yields to manipulation and waits for a new user camera baseline', () => {
    const controller = new MotionFramingController('model-instance-1')
    ready(controller.update(frame({ motionEnvelope: box(4) })))
    expect(controller.update(frame({ nowMs: 10, manualControl: true })).status).toBe('manual')
    expect(controller.update(frame({ nowMs: 20 })).status).toBe('manual')
    expect(ready(controller.update(frame({ nowMs: 30, cameraRevision: 1 }))).factor).toBe(1)
    expect(controller.update(frame({ nowMs: 40, cameraRevision: 0 })).status).toBe('stale')
  })

  it('isolates loaded models and resets retained envelopes on unload', () => {
    const controller = new MotionFramingController('model-instance-1')
    ready(controller.update(frame({ motionEnvelope: box(5) })))
    expect(controller.update(frame({ modelId: 'model-instance-2', nowMs: 10 })).status).toBe('stale')
    controller.reset()
    expect(ready(controller.update(frame())).factor).toBe(1)
  })

  it('ignores invalid time or revisions and reversed clocks', () => {
    const controller = new MotionFramingController('model-instance-1')
    expect(controller.update(frame({ nowMs: Number.NaN })).status).toBe('unavailable')
    expect(controller.update(frame({ motionRevision: -1 })).status).toBe('unavailable')
    ready(controller.update(frame({ nowMs: 100 })))
    expect(controller.update(frame({ nowMs: 99 })).status).toBe('stale')
  })

  it('does not make a proposal from invalid geometry or transforms', () => {
    const controller = new MotionFramingController('model-instance-1')
    expect(controller.update(frame({ motionEnvelope: undefined, liveBounds: undefined })).status).toBe('unavailable')
    expect(controller.update(frame({ modelToBaselineCamera: new Matrix4().makeScale(0, 1, 1) })).status).toBe('unavailable')
  })
})
