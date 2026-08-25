import type { ShallowRef } from 'vue'

import type { Live2DMotionControlPose, Live2DMotionControlState } from '../../stores/motion-control'

import { shallowRef } from 'vue'

import { neutralLive2DMotionControlPose } from '../../stores/motion-control'

export interface Live2DMotionSpringOutput {
  /** True while the spring follows a target or settles at neutral. */
  active: boolean
  /** The actual normalized pose after spring simulation. */
  pose: Live2DMotionControlPose
}

export interface Live2DMotionSpringController {
  output: Readonly<ShallowRef<Live2DMotionSpringOutput>>
  /** Advances the spring and returns its current output. */
  step: (control: Live2DMotionControlState, elapsedSeconds: number) => Live2DMotionSpringOutput
}

const settledPositionThreshold = 0.001
const settledVelocityThreshold = 0.001
const maximumStepSeconds = 1 / 120
const poseAxes = ['eyeX', 'eyeY', 'headX', 'headY', 'headZ', 'bodyX', 'bodyY', 'bodyZ', 'mouthForm', 'offsetX', 'offsetY'] as const

function stepAxis(options: {
  current: number
  target: number
  velocity: number
  elapsedSeconds: number
  stiffness: number
  damping: number
  mass: number
}): { position: number, velocity: number } {
  const acceleration = (options.stiffness * (options.target - options.current) - options.damping * options.velocity) / options.mass
  const velocity = options.velocity + acceleration * options.elapsedSeconds
  return {
    position: options.current + velocity * options.elapsedSeconds,
    velocity,
  }
}

function poseIsSettled(pose: Live2DMotionControlPose, velocity: Live2DMotionControlPose, target: Live2DMotionControlPose): boolean {
  return poseAxes.every(axis => (
    Math.abs(target[axis] - pose[axis]) < settledPositionThreshold
    && Math.abs(velocity[axis]) < settledVelocityThreshold
  ))
}

/**
 * Creates one spring simulation for a manual Live2D controller.
 *
 * `follow` increases spring stiffness. `inertia` increases mass and reduces
 * damping, which preserves velocity and permits more overshoot.
 */
export function createLive2DMotionSpring(initialPose: Live2DMotionControlPose = neutralLive2DMotionControlPose): Live2DMotionSpringController {
  let pose = { ...initialPose }
  let velocity = { ...neutralLive2DMotionControlPose }
  const output = shallowRef<Live2DMotionSpringOutput>({
    active: !poseIsSettled(pose, velocity, neutralLive2DMotionControlPose),
    pose: { ...pose },
  })

  function step(control: Live2DMotionControlState, elapsedSeconds: number): Live2DMotionSpringOutput {
    const target = control.active ? control.pose : neutralLive2DMotionControlPose
    const stiffness = 30 + control.dynamics.follow * 190
    const mass = 0.75 + control.dynamics.inertia * 2.25
    const dampingRatio = 1 - control.dynamics.inertia * 0.75
    const damping = 2 * dampingRatio * Math.sqrt(stiffness * mass)
    const boundedElapsedSeconds = Math.min(Math.max(elapsedSeconds, 0), 0.05)
    const stepCount = Math.max(1, Math.ceil(boundedElapsedSeconds / maximumStepSeconds))
    const stepSeconds = boundedElapsedSeconds / stepCount

    for (let stepIndex = 0; stepIndex < stepCount; stepIndex += 1) {
      for (const axis of poseAxes) {
        const next = stepAxis({
          current: pose[axis],
          target: target[axis],
          velocity: velocity[axis],
          elapsedSeconds: stepSeconds,
          stiffness,
          damping,
          mass,
        })
        pose[axis] = next.position
        velocity[axis] = next.velocity
      }
    }

    const settled = poseIsSettled(pose, velocity, target)
    if (settled) {
      pose = { ...target }
      velocity = { ...neutralLive2DMotionControlPose }
    }

    output.value = {
      active: control.active || !settled,
      pose: { ...pose },
    }
    return output.value
  }

  return { output, step }
}
