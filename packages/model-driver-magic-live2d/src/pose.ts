import type { TrainingSequence } from '@proj-airi/motion-driver-magic'

/** A normalized pose that the MAGIC Live2D driver can apply. */
export interface Pose {
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
  /** Horizontal model translation from -1 to 1. */
  offsetX: number
  /** Vertical model translation from -1 to 1. */
  offsetY: number
}

/** Pose axes used by Live2D motion adapters and filters. */
export const poseAxes = [
  'eyeX',
  'eyeY',
  'eyeSquint',
  'headX',
  'headY',
  'headZ',
  'bodyX',
  'bodyY',
  'bodyZ',
  'mouthForm',
  'mouthOpen',
  'offsetX',
  'offsetY',
] as const satisfies readonly (keyof Pose)[]

/** A pose with every normalized axis at its neutral value. */
export const neutralPose: Readonly<Pose> = Object.freeze({
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

/** Converts one Live2D pose to the stable MAGIC channel order. */
export function valuesFromPose(pose: Pose): number[] {
  return poseAxes.map(axis => pose[axis])
}

/** Converts one MAGIC frame from the stable channel order to a Live2D pose. */
export function poseFromValues(values: readonly number[]): Pose {
  if (values.length !== poseAxes.length)
    throw new Error(`The MAGIC frame must contain ${poseAxes.length} Live2D values.`)

  const pose = { ...neutralPose }
  for (let index = 0; index < poseAxes.length; index++)
    pose[poseAxes[index]] = values[index]
  return pose
}

/** Converts a fixed-rate Live2D pose sequence to MAGIC training frames. */
export function createTrainingSequence(source: {
  sampleRateHz: number
  sourceDurationMs: number
  poses: readonly Pose[]
}): TrainingSequence {
  return {
    sampleRateHz: source.sampleRateHz,
    sourceDurationMs: source.sourceDurationMs,
    frames: source.poses.map(valuesFromPose),
  }
}
