/** A part of the character that a pointer can touch. */
export type Live2DTouchRegion = 'body' | 'head'

/** The kind of touch. A pat is a stroke across the head while the pointer is pressed. */
export type Live2DTouchGesture = 'pat' | 'tap'

/** One touch on the character. */
export interface Live2DTouch {
  region: Live2DTouchRegion
  gesture: Live2DTouchGesture
  /** Horizontal position from -1 (left of the model) to 1 (right of the model). */
  side: number
}

/** What the region resolution reads from a model at one point. */
export interface Live2DTouchHitInput {
  /** Hit areas of the model that contain the point, with their author names. */
  hitAreaNames: readonly string[]
  /** True when the head box of the model contains the point. */
  insideHead: boolean
  /** True when a visible drawable of the model contains the point. */
  insideDrawable: boolean
}

const headAreaPattern = /head|face/i
const bodyAreaPattern = /body|chest|bust|belly|torso/i

/**
 * Resolves the region of a touch.
 *
 * Author hit areas win when the model declares them. Many models declare
 * none, so the head box of the head tracker and the drawable bounds are the
 * fallback.
 */
export function resolveLive2DTouchRegion(input: Live2DTouchHitInput): Live2DTouchRegion | undefined {
  if (input.hitAreaNames.some(name => headAreaPattern.test(name)))
    return 'head'
  if (input.hitAreaNames.some(name => bodyAreaPattern.test(name)))
    return 'body'
  if (input.insideHead)
    return 'head'
  if (input.insideDrawable || input.hitAreaNames.length > 0)
    return 'body'
  return undefined
}

/** Limits of the gesture recognition, in CSS pixels and milliseconds. */
export interface Live2DTouchGestureOptions {
  /** Largest pointer travel of a tap. @default 8 */
  tapMaxTravel: number
  /** Longest press of a tap. @default 450 */
  tapMaxDurationMs: number
  /** Pointer travel over the head for each pat. @default 70 */
  patTravel: number
}

export const defaultLive2DTouchGestureOptions: Live2DTouchGestureOptions = Object.freeze({
  tapMaxTravel: 8,
  tapMaxDurationMs: 450,
  patTravel: 70,
})

/** A pointer sample for the gesture tracker. */
export interface Live2DTouchPointerSample {
  x: number
  y: number
  atMs: number
  /** The touch at this point, or undefined outside the character. */
  hit: Omit<Live2DTouch, 'gesture'> | undefined
}

/**
 * Recognizes taps and pats from one pointer.
 *
 * A press and a release with little travel is a tap on the region under the
 * press. A press that moves over the head gives one pat for each `patTravel`
 * of travel, and its release gives no tap.
 */
export function createLive2DTouchGestureTracker(options: Live2DTouchGestureOptions = defaultLive2DTouchGestureOptions) {
  let press: { start: Live2DTouchPointerSample, last: Live2DTouchPointerSample, travel: number, patTravel: number, patted: boolean } | undefined

  function down(sample: Live2DTouchPointerSample) {
    press = sample.hit ? { start: sample, last: sample, travel: 0, patTravel: 0, patted: false } : undefined
  }

  function move(sample: Live2DTouchPointerSample): Live2DTouch | undefined {
    if (!press)
      return undefined

    const step = Math.hypot(sample.x - press.last.x, sample.y - press.last.y)
    press.travel += step
    press.last = sample
    if (sample.hit?.region !== 'head')
      return undefined

    press.patTravel += step
    if (press.patTravel < options.patTravel)
      return undefined

    press.patTravel = 0
    press.patted = true
    return { ...sample.hit, gesture: 'pat' }
  }

  function up(sample: Live2DTouchPointerSample): Live2DTouch | undefined {
    const current = press
    press = undefined
    if (!current || current.patted || !current.start.hit)
      return undefined

    const travel = current.travel + Math.hypot(sample.x - current.last.x, sample.y - current.last.y)
    if (travel > options.tapMaxTravel || sample.atMs - current.start.atMs > options.tapMaxDurationMs)
      return undefined

    return { ...current.start.hit, gesture: 'tap' }
  }

  function cancel() {
    press = undefined
  }

  return { down, move, up, cancel }
}

/** Parameter offsets that a touch reaction adds on top of the other motion. */
export interface Live2DTouchReactionOffsets {
  /** Head angles, in degrees. */
  angleX: number
  angleY: number
  angleZ: number
  /** Body angles, in degrees. */
  bodyAngleX: number
  bodyAngleY: number
  /** Share of eye opening to close, from 0 to 1. */
  eyeSquint: number
}

interface Impulse {
  startedAt: number
  attack: number
  decay: number
  peak: Live2DTouchReactionOffsets
}

const zeroOffsets: Live2DTouchReactionOffsets = Object.freeze({
  angleX: 0,
  angleY: 0,
  angleZ: 0,
  bodyAngleX: 0,
  bodyAngleY: 0,
  eyeSquint: 0,
})

function impulseFor(touch: Live2DTouch, startedAt: number): Impulse {
  const side = Math.min(1, Math.max(-1, touch.side))
  if (touch.region === 'head' && touch.gesture === 'pat') {
    return {
      startedAt,
      attack: 0.15,
      decay: 0.7,
      peak: { ...zeroOffsets, angleY: -5, angleZ: side * 9, eyeSquint: 0.65 },
    }
  }
  if (touch.region === 'head') {
    return {
      startedAt,
      attack: 0.08,
      decay: 0.35,
      peak: { ...zeroOffsets, angleX: -side * 4, angleY: -7, angleZ: side * 6, eyeSquint: 0.45 },
    }
  }
  return {
    startedAt,
    attack: 0.05,
    decay: 0.3,
    peak: { ...zeroOffsets, angleY: 6, bodyAngleX: -side * 4, bodyAngleY: -3 },
  }
}

function envelope(impulse: Impulse, now: number): number {
  const elapsed = now - impulse.startedAt
  if (elapsed < 0)
    return 0
  if (elapsed < impulse.attack)
    return Math.sin(elapsed / impulse.attack * Math.PI / 2)
  return Math.exp(-(elapsed - impulse.attack) / impulse.decay)
}

/**
 * Creates the procedural reaction of one model to touches.
 *
 * Each touch adds an impulse with a short rise and an exponential decay.
 * Repeated pats overlap, so a long stroke keeps the head tilted and the eyes
 * narrowed. The sum is bounded, so many fast taps cannot twist the head.
 */
export function createLive2DTouchReaction() {
  let impulses: Impulse[] = []

  function trigger(touch: Live2DTouch, nowSeconds: number) {
    impulses.push(impulseFor(touch, nowSeconds))
    if (impulses.length > 8)
      impulses = impulses.slice(-8)
  }

  function sample(nowSeconds: number): Live2DTouchReactionOffsets {
    impulses = impulses.filter(impulse => nowSeconds - impulse.startedAt < impulse.attack + impulse.decay * 6)
    if (impulses.length === 0)
      return zeroOffsets

    const sum = { ...zeroOffsets }
    for (const impulse of impulses) {
      const weight = envelope(impulse, nowSeconds)
      for (const key of Object.keys(sum) as (keyof Live2DTouchReactionOffsets)[])
        sum[key] += impulse.peak[key] * weight
    }

    return {
      angleX: Math.min(10, Math.max(-10, sum.angleX)),
      angleY: Math.min(10, Math.max(-10, sum.angleY)),
      angleZ: Math.min(14, Math.max(-14, sum.angleZ)),
      bodyAngleX: Math.min(6, Math.max(-6, sum.bodyAngleX)),
      bodyAngleY: Math.min(6, Math.max(-6, sum.bodyAngleY)),
      eyeSquint: Math.min(0.8, Math.max(0, sum.eyeSquint)),
    }
  }

  function reset() {
    impulses = []
  }

  return { trigger, sample, reset }
}

/**
 * Finds the motion group that answers a touch, when the model has one.
 *
 * Cubism sample models name these groups `TapBody` or `tap_body`. The match
 * ignores case and separators.
 */
export function findLive2DTouchMotionGroup(groupNames: readonly string[], region: Live2DTouchRegion): string | undefined {
  const wanted = region === 'head' ? ['taphead', 'pathead', 'flickhead'] : ['tapbody', 'tap']
  const normalized = groupNames.map(name => ({ name, key: name.toLowerCase().replace(/[^a-z]/g, '') }))
  for (const key of wanted) {
    const match = normalized.find(group => group.key === key)
    if (match)
      return match.name
  }
  return undefined
}
