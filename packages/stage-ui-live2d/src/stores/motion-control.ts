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

/** The active manual control owner and its current normalized pose. */
export interface Live2DMotionControlState {
  active: boolean
  ownerId: string | null
  pose: Live2DMotionControlPose
}

type Live2DMotionControlEvent
  = | {
    type: 'live2d-motion-control-set'
    ownerId: string
    pose: Live2DMotionControlPose
  }
  | {
    type: 'live2d-motion-control-release'
    ownerId: string
  }

const neutralPose: Live2DMotionControlPose = Object.freeze({ x: 0, y: 0, headZ: 0, bodyZ: 0 })
const horizontalModelOffset = 20

function clampAxis(value: number): number {
  return Math.min(1, Math.max(-1, value))
}

function normalizePose(pose: Live2DMotionControlPose): Live2DMotionControlPose {
  return {
    x: clampAxis(pose.x),
    y: clampAxis(pose.y),
    headZ: clampAxis(pose.headZ),
    bodyZ: clampAxis(pose.bodyZ),
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
 *   ownerId: 'devtool',
 *   pose: { x: 1, y: 1, headZ: 0, bodyZ: 0 },
 * })
 * // => { x: 20, y: -40 }
 */
export function getLive2DMotionControlModelOffset(control: Live2DMotionControlState): { x: number, y: number } {
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
  })

  function applyEvent(event: Live2DMotionControlEvent) {
    if (event.type === 'live2d-motion-control-set') {
      control.value = {
        active: true,
        ownerId: event.ownerId,
        pose: normalizePose(event.pose),
      }
      return
    }

    if (control.value.ownerId !== event.ownerId)
      return

    control.value = {
      active: false,
      ownerId: null,
      pose: neutralPose,
    }
  }

  function setPose(ownerId: string, pose: Live2DMotionControlPose) {
    const event: Live2DMotionControlEvent = {
      type: 'live2d-motion-control-set',
      ownerId,
      pose: normalizePose(pose),
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
