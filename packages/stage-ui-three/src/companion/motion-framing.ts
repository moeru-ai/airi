import type { Matrix4 } from 'three'

import { Box3, Vector3 } from 'three'

/** A baseline perspective lens. Automatic framing never changes its orientation, pivot, or lens settings. */
export interface FramingLens {
  verticalFovDegrees: number
  aspect: number
  near: number
  far: number
  zoom: number
}

/** All positions use the baseline camera's local coordinates. The camera looks along negative Z. */
export interface FramingRequest {
  bounds: Box3
  anchor: Vector3
  lens: FramingLens
  /** Fraction of each half viewport reserved as a margin. @default 0.1 */
  margin?: number
  /** Maximum anchor-distance multiplier, always measured from the baseline. @default 4 */
  maxZoomOut?: number
}

/** Apply this offset in the baseline camera's axes. No native window operation is requested. */
export interface FramingSolution {
  factor: number
  cameraOffset: Vector3
  fits: boolean
  limited: boolean
}

/** Bounds share one stable model-local space, including props, hair, clothes, and any allowed root motion. */
export interface MotionFramingFrame {
  /** Unique loaded-model identity, not an asset filename. */
  modelId: string
  /** Increase for every replacement, including repeated playback of the same clip. */
  motionRevision: number
  /** Increase after user camera changes. Never increase for this helper's own camera offset. */
  cameraRevision: number
  nowMs: number
  manualControl: boolean
  motionEnvelope?: Box3
  /** Current visible geometry, after animation and secondary motion. Missing geometry never authorizes shrinking. */
  liveBounds?: Box3
  modelToBaselineCamera: Matrix4
  anchor: Vector3
  lens: FramingLens
}

/** Automatic output is absent during manual control, stale updates, and invalid geometry. */
export type MotionFramingResult
  = { status: 'ready', solution: FramingSolution }
    | { status: 'manual' | 'stale' | 'unavailable' }

/** Bounded policy settings. Invalid values use their documented defaults. */
export interface MotionFramingOptions {
  /** @default 0.1 */
  margin?: number
  /** @default 4 */
  maxZoomOut?: number
  /** Milliseconds after a smaller envelope becomes stable. @default 750 */
  shrinkDelayMs?: number
  /** Maximum multiplier decrease per second. @default 0.75 */
  shrinkRate?: number
  /** Relative size change required before shrinking. @default 0.08 */
  shrinkThreshold?: number
  /** Keep old envelopes through crossfades. Match this to the runtime's longest transition. @default 400 */
  transitionHoldMs?: number
}

interface RetiringEnvelope {
  bounds: Box3
  untilMs: number
}

function bounded(value: number | undefined, fallback: number, min: number, max: number) {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value!)) : fallback
}

function finiteVector(vector: Vector3) {
  // This numeric guard prevents overflow. Model scale does not determine the camera's growth limit.
  return [vector.x, vector.y, vector.z].every(value => Number.isFinite(value) && Math.abs(value) <= 1e12)
}

function validBounds(bounds: Box3 | undefined): bounds is Box3 {
  return !!bounds && finiteVector(bounds.min) && finiteVector(bounds.max) && !bounds.isEmpty()
}

/** Unions valid envelopes without mutating them. Missing, inverted, and non-finite boxes are ignored. */
export function combineMotionEnvelopes(bounds: readonly (Box3 | undefined)[]): Box3 | undefined {
  const combined = new Box3()
  for (const envelope of bounds) {
    if (validBounds(envelope))
      combined.union(envelope)
  }
  return combined.isEmpty() ? undefined : combined
}

/** Converts an envelope through a finite affine transform. Perspective or singular transforms are rejected. */
export function transformMotionEnvelope(bounds: Box3, transform: Matrix4): Box3 | undefined {
  const e = transform.elements
  if (!validBounds(bounds) || !e.every(Number.isFinite)
    || e[3] !== 0 || e[7] !== 0 || e[11] !== 0 || e[15] !== 1
    || transform.determinant() === 0) {
    return undefined
  }
  const transformed = bounds.clone().applyMatrix4(transform)
  return validBounds(transformed) ? transformed : undefined
}

function validLens(lens: FramingLens) {
  return Object.values(lens).every(Number.isFinite)
    && lens.verticalFovDegrees > 0 && lens.verticalFovDegrees < 179
    && lens.aspect > 0 && lens.zoom > 0 && lens.near > 0 && lens.far > lens.near
}

function offsetForAnchor(anchor: Vector3, factor: number) {
  return new Vector3(-anchor.x, -anchor.y, -anchor.z).multiplyScalar(factor - 1)
}

function fits(bounds: Box3, anchor: Vector3, lens: FramingLens, margin: number, factor: number) {
  const offset = offsetForAnchor(anchor, factor)
  const depth = -bounds.max.z + offset.z
  const tanY = Math.tan(lens.verticalFovDegrees * Math.PI / 360) / lens.zoom * (1 - margin)
  const tanX = tanY * lens.aspect
  const tolerance = Math.max(1, depth) * 1e-10
  return depth >= lens.near - tolerance && -bounds.min.z + offset.z <= lens.far + tolerance
    && Math.max(Math.abs(bounds.min.x - offset.x), Math.abs(bounds.max.x - offset.x)) <= depth * tanX + tolerance
    && Math.max(Math.abs(bounds.min.y - offset.y), Math.abs(bounds.max.y - offset.y)) <= depth * tanY + tolerance
}

/**
 * Finds a conservative dolly offset while preserving the anchor's exact screen position.
 * Camera-space AABB corners bound every visible point. Invalid geometry or an off-viewport anchor returns no proposal.
 * A limited result requires a compact motion or a user decision. It never promises complete visibility.
 */
export function solvePerspectiveFraming(request: FramingRequest): FramingSolution | undefined {
  const { bounds, anchor, lens } = request
  if (!validBounds(bounds) || !finiteVector(anchor) || !validLens(lens) || -anchor.z < lens.near)
    return undefined

  const margin = bounded(request.margin, 0.1, 0, 0.4)
  const maximum = bounded(request.maxZoomOut, 4, 1, 8)
  const tanY = Math.tan(lens.verticalFovDegrees * Math.PI / 360) / lens.zoom * (1 - margin)
  const tanX = tanY * lens.aspect
  const anchorDepth = -anchor.z
  const nearestDepth = -bounds.max.z
  const denominators = [tanX * anchorDepth - anchor.x, tanX * anchorDepth + anchor.x, tanY * anchorDepth - anchor.y, tanY * anchorDepth + anchor.y]
  if (!denominators.every(value => Number.isFinite(value) && value > 0))
    return undefined

  // With u = factor - 1, each frustum plane becomes one linear inequality in u.
  const requirements = [(bounds.max.x - tanX * nearestDepth) / denominators[0]!, (-bounds.min.x - tanX * nearestDepth) / denominators[1]!, (bounds.max.y - tanY * nearestDepth) / denominators[2]!, (-bounds.min.y - tanY * nearestDepth) / denominators[3]!, (lens.near - nearestDepth) / anchorDepth]
  const required = 1 + Math.max(0, ...requirements)
  const farLimit = Math.max(1, 1 + (lens.far + bounds.min.z) / anchorDepth)
  const factor = Math.min(maximum, farLimit, required)
  if (!Number.isFinite(factor))
    return undefined

  const complete = fits(bounds, anchor, lens, margin, factor)
  return { factor, cameraOffset: offsetForAnchor(anchor, factor), fits: complete, limited: !complete }
}

/**
 * Owns one model's envelope history and camera-distance hysteresis, without touching a camera or desktop window.
 * Growth is immediate. Shrinking waits for stable bounds. Every output remains relative to the unchanged baseline.
 * Manual control cancels proposals until the caller supplies a new camera revision. Create a new controller for each loaded model.
 */
export class MotionFramingController {
  private readonly margin: number
  private readonly maxZoomOut: number
  private readonly shrinkDelayMs: number
  private readonly shrinkRate: number
  private readonly shrinkThreshold: number
  private readonly transitionHoldMs: number
  private cameraRevision = -1
  private motionRevision = -1
  private activeEnvelope: Box3 | undefined
  private readonly retiring: RetiringEnvelope[] = []
  private factor = 1
  private shrinkSince: number | undefined
  private previousTime: number | undefined
  private suspended = false

  constructor(private readonly modelId: string, options: MotionFramingOptions = {}) {
    this.margin = bounded(options.margin, 0.1, 0, 0.4)
    this.maxZoomOut = bounded(options.maxZoomOut, 4, 1, 8)
    this.shrinkDelayMs = bounded(options.shrinkDelayMs, 750, 0, 10_000)
    this.shrinkRate = bounded(options.shrinkRate, 0.75, 0.01, 4)
    this.shrinkThreshold = bounded(options.shrinkThreshold, 0.08, 0, 0.5)
    this.transitionHoldMs = bounded(options.transitionHoldMs, 400, 0, 10_000)
  }

  /** Resets model-local history. Call on unload, disposal, or when automatic framing is disabled. */
  reset() {
    this.cameraRevision = -1
    this.motionRevision = -1
    this.activeEnvelope = undefined
    this.retiring.length = 0
    this.factor = 1
    this.shrinkSince = undefined
    this.previousTime = undefined
    this.suspended = false
  }

  /** Use a monotonic clock and a baseline transform that excludes this helper's own output. */
  update(frame: MotionFramingFrame): MotionFramingResult {
    if (!frame.modelId || !Number.isFinite(frame.nowMs)
      || !Number.isSafeInteger(frame.cameraRevision) || frame.cameraRevision < 0
      || !Number.isSafeInteger(frame.motionRevision) || frame.motionRevision < 0) {
      return { status: 'unavailable' }
    }
    if (this.modelId !== frame.modelId)
      return { status: 'stale' }
    if (frame.cameraRevision < this.cameraRevision || frame.motionRevision < this.motionRevision
      || (this.previousTime !== undefined && frame.nowMs < this.previousTime)) {
      return { status: 'stale' }
    }
    const dt = this.previousTime === undefined ? 0 : Math.min(0.1, (frame.nowMs - this.previousTime) / 1000)
    this.previousTime = frame.nowMs
    if (frame.cameraRevision !== this.cameraRevision) {
      this.cameraRevision = frame.cameraRevision
      this.factor = 1
      this.shrinkSince = undefined
      this.suspended = false
    }
    if (frame.manualControl)
      this.suspended = true
    if (this.suspended)
      return { status: 'manual' }

    this.retiring.splice(0, this.retiring.length, ...this.retiring.filter(entry => entry.untilMs > frame.nowMs))
    if (frame.motionRevision > this.motionRevision) {
      if (this.activeEnvelope && this.transitionHoldMs > 0)
        this.retiring.push({ bounds: this.activeEnvelope, untilMs: frame.nowMs + this.transitionHoldMs })
      this.motionRevision = frame.motionRevision
      this.activeEnvelope = undefined
      this.shrinkSince = undefined
    }
    if (validBounds(frame.motionEnvelope))
      this.activeEnvelope = frame.motionEnvelope.clone()
    if (this.retiring.length > 8) {
      // Merge older crossfades into one finite envelope instead of retaining an unbounded replacement history.
      const bounds = combineMotionEnvelopes(this.retiring.map(entry => entry.bounds))!
      const untilMs = Math.max(...this.retiring.map(entry => entry.untilMs))
      this.retiring.splice(0, this.retiring.length, { bounds, untilMs })
    }
    const combined = combineMotionEnvelopes([this.activeEnvelope, frame.liveBounds, ...this.retiring.map(entry => entry.bounds)])
    const bounds = combined && transformMotionEnvelope(combined, frame.modelToBaselineCamera)
    const anchor = frame.anchor.clone().applyMatrix4(frame.modelToBaselineCamera)
    const target = bounds && solvePerspectiveFraming({ bounds, anchor, lens: frame.lens, margin: this.margin, maxZoomOut: this.maxZoomOut })
    if (!bounds || !target) {
      this.shrinkSince = undefined
      return { status: 'unavailable' }
    }

    if (target.factor >= this.factor) {
      this.factor = target.factor
      this.shrinkSince = undefined
    }
    else if (validBounds(frame.liveBounds) && (this.shrinkSince !== undefined || target.factor <= this.factor * (1 - this.shrinkThreshold))) {
      this.shrinkSince ??= frame.nowMs
      if (frame.nowMs - this.shrinkSince >= this.shrinkDelayMs)
        this.factor = Math.max(target.factor, this.factor - this.shrinkRate * dt)
    }
    else {
      this.shrinkSince = undefined
    }
    const complete = fits(bounds, anchor, frame.lens, this.margin, this.factor)
    return { status: 'ready', solution: {
      factor: this.factor,
      cameraOffset: offsetForAnchor(anchor, this.factor),
      fits: complete,
      limited: !complete,
    } }
  }
}
