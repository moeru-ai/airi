import { useBroadcastChannel } from '@vueuse/core'
import { defineStore } from 'pinia'
import { shallowRef, watch } from 'vue'

/** A normalized pose for manual Live2D motion control. */
export interface Live2DMotionControlPose {
  /** Horizontal position from -1 (left) to 1 (right). */
  x: number
  /** Vertical position from -1 (down) to 1 (up). */
  y: number
  /** Head roll from -1 (left) to 1 (right). */
  headZ: number
  /** Body roll from -1 (left) to 1 (right). */
  bodyZ: number
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

const neutralPose: Live2DMotionControlPose = Object.freeze({ x: 0, y: 0, headZ: 0, bodyZ: 0 })
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
    x: clampAxis(pose.x),
    y: clampAxis(pose.y),
    headZ: clampAxis(pose.headZ),
    bodyZ: clampAxis(pose.bodyZ),
  }
}

function normalizeDynamics(dynamics: Live2DMotionControlDynamics): Live2DMotionControlDynamics {
  return {
    follow: clampFollow(dynamics.follow),
    inertia: clampUnit(dynamics.inertia),
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
 *   pose: { x: 1, y: 1, headZ: 0, bodyZ: 0 },
 * })
 * // => { x: 20, y: -40 }
 */
export function getLive2DMotionControlModelOffset(control: Pick<Live2DMotionControlState, 'active' | 'pose'>): { x: number, y: number } {
  if (!control.active)
    return { x: 0, y: 0 }

  return {
    x: control.pose.x * horizontalModelOffset,
    y: -control.pose.y * horizontalModelOffset * 2,
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
    pose: neutralPose,
    dynamics: defaultLive2DMotionControlDynamics,
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

    if (control.value.ownerId !== event.ownerId)
      return

    control.value = {
      active: false,
      ownerId: null,
      pose: neutralPose,
      dynamics: control.value.dynamics,
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

  watch(data, (event) => {
    if (event)
      applyEvent(event)
  })

  return {
    control,
    setPose,
    release,
  }
})
