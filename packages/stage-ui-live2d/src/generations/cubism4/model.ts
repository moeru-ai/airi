import type { LoadedLive2DModel } from '../loader'

interface Cubism4Motion {
  _motionData: {
    curves: Array<{ id: string }>
  }
}

/** Cubism 4/5 models require no AIRI-specific preparation after SDK setup. */
export function prepareCubism4Model(_model: LoadedLive2DModel, _renderer: object): void {}

/** Removes idle gaze curves so AIRI's eye-focus controller owns gaze direction. */
export function disableCubism4IdleEyeMovement(model: LoadedLive2DModel): void {
  const idleGroup = model.motionManager.groups.idle
  if (!idleGroup)
    return

  const idleMotions = model.motionManager.motionGroups[idleGroup]
  for (const motion of idleMotions ?? []) {
    if (!motion)
      continue

    for (const curve of (motion as Cubism4Motion)._motionData.curves) {
      if (curve.id === 'ParamEyeBallX' || curve.id === 'ParamEyeBallY')
        curve.id = `_${curve.id}`
    }
  }
}
