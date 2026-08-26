import { useBroadcastChannel } from '@vueuse/core'
import { defineStore } from 'pinia'
import { shallowRef, watch } from 'vue'

/** A normalized pose for manual Live2D motion control. */
export interface Live2DMotionControlPose {
  eyeX: number
  eyeY: number
  /** Squint amount from 0 (open) to 1 (closed). */
  eyeSquint: number
  headX: number
  headY: number
  /** Head roll from -1 (left) to 1 (right). */
  headZ: number
  bodyX: number
  bodyY: number
  /** Body roll from -1 (left) to 1 (right). */
  bodyZ: number
  /** Mouth shape from -1 to 1. */
  mouthForm: number
  /** Mouth opening from 0 (closed) to 1 (open). */
  mouthOpen: number
  /** Joystick-only horizontal model translation. */
  offsetX: number
  /** Joystick-only vertical model translation. */
  offsetY: number
}

/** Spring settings for manual Live2D motion. */
export interface Live2DMotionControlDynamics {
  /** Target-following strength from 0 (soft) to 2 (very fast). @default 0.6 */
  follow: number
  /** Preserved momentum from 0 (settled) to 1 (bouncy). @default 0.35 */
  inertia: number
}

/** The active manual control owner, target pose, and spring settings. */
export interface Live2DMotionControlState {
  active: boolean
  ownerId: string | null
  pose: Live2DMotionControlPose
  dynamics: Live2DMotionControlDynamics
}

/** Settings for the manual render-time breath curve. */
export interface Live2DBreathControlOptions {
  /** Length of the inhale and exhale spans, in seconds. @default 3.2 */
  cycleSeconds: number
  /** Time held at the minimum after each exhale, in seconds. @default 1.2 */
  exhaleDwellSeconds: number
  /** Lowest value written to `ParamBreath`. @default 0 */
  minimum: number
  /** Highest value written to `ParamBreath`. @default 0.5 */
  maximum: number
  /** Fraction of the inhale and exhale spans used to inhale. @default 0.4 */
  inhaleRatio: number
}

/** The active manual breath owner and its shared phase origin. */
export interface Live2DBreathControlState {
  active: boolean
  ownerId: string | null
  startedAtMs: number
  options: Live2DBreathControlOptions
}

/** One sampled point from the manual breath curve. */
export interface Live2DBreathSample {
  phase: number
  stage: 'inhale' | 'exhale' | 'dwell'
  value: number
}

type Live2DMotionControlEvent
  = | {
    type: 'live2d-motion-control-set'
    ownerId: string
    pose: Live2DMotionControlPose
    dynamics: Live2DMotionControlDynamics
  }
  | {
    type: 'live2d-motion-control-release'
    ownerId: string
  }
  | {
    type: 'live2d-breath-control-set'
    ownerId: string
    startedAtMs: number
    options: Live2DBreathControlOptions
  }
  | {
    type: 'live2d-breath-control-release'
    ownerId: string
  }

export const neutralLive2DMotionControlPose: Live2DMotionControlPose = Object.freeze({
  eyeX: 0,
  eyeY: 0,
  eyeSquint: 0,
  headX: 0,
  headY: 0,
  headZ: 0,
  bodyX: 0,
  bodyY: 0,
  bodyZ: 0,
  mouthForm: 0,
  mouthOpen: 0,
  offsetX: 0,
  offsetY: 0,
})
/** Default settings for the manual Live2D breath curve. */
export const defaultLive2DBreathControlOptions: Live2DBreathControlOptions = Object.freeze({
  cycleSeconds: 3.2,
  exhaleDwellSeconds: 1.2,
  minimum: 0,
  maximum: 0.5,
  inhaleRatio: 0.4,
})
const horizontalModelOffset = 20
/** Default spring settings for the Live2D motion devtool. */
export const defaultLive2DMotionControlDynamics: Live2DMotionControlDynamics = Object.freeze({ follow: 0.6, inertia: 0.35 })

function clampAxis(value: number): number {
  return Math.min(1, Math.max(-1, value))
}

function clampUnit(value: number): number {
  return Math.min(1, Math.max(0, value))
}

function clampFollow(value: number): number {
  return Math.min(2, Math.max(0, value))
}

function normalizePose(pose: Live2DMotionControlPose): Live2DMotionControlPose {
  return {
    eyeX: clampAxis(pose.eyeX),
    eyeY: clampAxis(pose.eyeY),
    eyeSquint: clampUnit(pose.eyeSquint),
    headX: clampAxis(pose.headX),
    headY: clampAxis(pose.headY),
    headZ: clampAxis(pose.headZ),
    bodyX: clampAxis(pose.bodyX),
    bodyY: clampAxis(pose.bodyY),
    bodyZ: clampAxis(pose.bodyZ),
    mouthForm: clampAxis(pose.mouthForm),
    mouthOpen: clampUnit(pose.mouthOpen),
    offsetX: clampAxis(pose.offsetX),
    offsetY: clampAxis(pose.offsetY),
  }
}

function normalizeDynamics(dynamics: Live2DMotionControlDynamics): Live2DMotionControlDynamics {
  return {
    follow: clampFollow(dynamics.follow),
    inertia: clampUnit(dynamics.inertia),
  }
}

function normalizeBreathOptions(options: Live2DBreathControlOptions): Live2DBreathControlOptions {
  const cycleSeconds = Number.isFinite(options.cycleSeconds)
    ? Math.min(30, Math.max(0.5, options.cycleSeconds))
    : defaultLive2DBreathControlOptions.cycleSeconds
  const exhaleDwellSeconds = Number.isFinite(options.exhaleDwellSeconds)
    ? Math.min(30, Math.max(0, options.exhaleDwellSeconds))
    : defaultLive2DBreathControlOptions.exhaleDwellSeconds
  const minimum = Number.isFinite(options.minimum)
    ? clampUnit(options.minimum)
    : defaultLive2DBreathControlOptions.minimum
  const requestedMaximum = Number.isFinite(options.maximum)
    ? clampUnit(options.maximum)
    : defaultLive2DBreathControlOptions.maximum
  const inhaleRatio = Number.isFinite(options.inhaleRatio)
    ? Math.min(0.9, Math.max(0.1, options.inhaleRatio))
    : defaultLive2DBreathControlOptions.inhaleRatio

  return {
    cycleSeconds,
    exhaleDwellSeconds,
    minimum,
    maximum: Math.max(minimum, requestedMaximum),
    inhaleRatio,
  }
}

/**
 * Samples the manual breath curve.
 *
 * The curve uses one half-cosine for the inhale and one for the exhale. It
 * then holds the minimum value before the next inhale. The separate spans keep
 * both transitions smooth when the inhale ratio changes.
 */
export function sampleLive2DBreath(options: Live2DBreathControlOptions, elapsedSeconds: number): Live2DBreathSample {
  const normalized = normalizeBreathOptions(options)
  const safeElapsedSeconds = Number.isFinite(elapsedSeconds) ? Math.max(0, elapsedSeconds) : 0
  const repeatSeconds = normalized.cycleSeconds + normalized.exhaleDwellSeconds
  const elapsedInRepeat = safeElapsedSeconds % repeatSeconds
  const phase = elapsedInRepeat / repeatSeconds

  if (elapsedInRepeat >= normalized.cycleSeconds) {
    return {
      phase,
      stage: 'dwell',
      value: normalized.minimum,
    }
  }

  const breathPhase = elapsedInRepeat / normalized.cycleSeconds

  if (breathPhase < normalized.inhaleRatio) {
    const inhaleProgress = breathPhase / normalized.inhaleRatio
    const curve = (1 - Math.cos(Math.PI * inhaleProgress)) / 2
    return {
      phase,
      stage: 'inhale',
      value: normalized.minimum + (normalized.maximum - normalized.minimum) * curve,
    }
  }

  const exhaleProgress = (breathPhase - normalized.inhaleRatio) / (1 - normalized.inhaleRatio)
  const curve = (1 + Math.cos(Math.PI * exhaleProgress)) / 2
  return {
    phase,
    stage: 'exhale',
    value: normalized.minimum + (normalized.maximum - normalized.minimum) * curve,
  }
}

/**
 * Maps active joystick motion to the Pixi model position.
 *
 * The joystick Y axis points up, while the Pixi Y axis points down.
 *
 * @example
 * getLive2DMotionControlModelOffset({
 *   active: true,
 *   pose: { ...neutralLive2DMotionControlPose, offsetX: 1, offsetY: 1 },
 * })
 * // => { x: 20, y: -40 }
 */
export function getLive2DMotionControlModelOffset(control: Pick<Live2DMotionControlState, 'active' | 'pose'>): { x: number, y: number } {
  if (!control.active)
    return { x: 0, y: 0 }

  return {
    x: control.pose.offsetX * horizontalModelOffset,
    y: -control.pose.offsetY * horizontalModelOffset * 2,
  }
}

/**
 * Shares transient manual Live2D motion between Electron renderer windows.
 *
 * The latest set event owns the control. A release event only clears the same
 * owner, so a stale window cannot release a newer controller. This store uses
 * a direct channel because joystick updates are transient and high frequency.
 */
export const useLive2DMotionControl = defineStore('live2d-motion-control', () => {
  const { data, post } = useBroadcastChannel<Live2DMotionControlEvent, Live2DMotionControlEvent>({
    name: 'airi-stores-stage-ui-live2d-motion-control',
  })
  const control = shallowRef<Live2DMotionControlState>({
    active: false,
    ownerId: null,
    pose: neutralLive2DMotionControlPose,
    dynamics: defaultLive2DMotionControlDynamics,
  })
  const breathControl = shallowRef<Live2DBreathControlState>({
    active: false,
    ownerId: null,
    startedAtMs: 0,
    options: defaultLive2DBreathControlOptions,
  })

  function applyEvent(event: Live2DMotionControlEvent) {
    if (event.type === 'live2d-motion-control-set') {
      control.value = {
        active: true,
        ownerId: event.ownerId,
        pose: normalizePose(event.pose),
        dynamics: normalizeDynamics(event.dynamics),
      }
      return
    }

    if (event.type === 'live2d-motion-control-release') {
      if (control.value.ownerId !== event.ownerId)
        return

      control.value = {
        active: false,
        ownerId: null,
        pose: neutralLive2DMotionControlPose,
        dynamics: control.value.dynamics,
      }
      return
    }

    if (event.type === 'live2d-breath-control-set') {
      breathControl.value = {
        active: true,
        ownerId: event.ownerId,
        startedAtMs: event.startedAtMs,
        options: normalizeBreathOptions(event.options),
      }
      return
    }

    if (breathControl.value.ownerId !== event.ownerId)
      return

    breathControl.value = {
      active: false,
      ownerId: null,
      startedAtMs: 0,
      options: breathControl.value.options,
    }
  }

  function setPose(ownerId: string, pose: Live2DMotionControlPose, dynamics: Live2DMotionControlDynamics) {
    const event: Live2DMotionControlEvent = {
      type: 'live2d-motion-control-set',
      ownerId,
      pose: normalizePose(pose),
      dynamics: normalizeDynamics(dynamics),
    }
    applyEvent(event)
    post(event)
  }

  function release(ownerId: string) {
    const event: Live2DMotionControlEvent = {
      type: 'live2d-motion-control-release',
      ownerId,
    }
    applyEvent(event)
    post(event)
  }

  function setBreath(ownerId: string, options: Live2DBreathControlOptions, startedAtMs = Date.now()) {
    const event: Live2DMotionControlEvent = {
      type: 'live2d-breath-control-set',
      ownerId,
      startedAtMs,
      options: normalizeBreathOptions(options),
    }
    applyEvent(event)
    post(event)
  }

  function releaseBreath(ownerId: string) {
    const event: Live2DMotionControlEvent = {
      type: 'live2d-breath-control-release',
      ownerId,
    }
    applyEvent(event)
    post(event)
  }

  watch(data, (event) => {
    if (event)
      applyEvent(event)
  })

  return {
    control,
    breathControl,
    setPose,
    release,
    setBreath,
    releaseBreath,
  }
})
