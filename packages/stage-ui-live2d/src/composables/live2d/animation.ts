import type { InternalModel } from 'pixi-live2d-display'

import { MathUtils } from 'three'

// Imported from the owning module rather than `../../utils`: that barrel also
// re-exports `live2d-preview`, which pulls in PIXI and image decoding at module
// scope for what is otherwise a pure sampling helper.
import { randomSaccadeInterval } from '../../utils/eye-motions'

/**
 * Simulates idle gaze by retargeting the SDK's focus controller on a saccade
 * schedule.
 *
 * The focus controller is the single owner of idle gaze on purpose. Once
 * `motionManager.update` returns, both generations fold `focusController.x/y`
 * into the eyeball parameters *and* the head/body angles (`updateFocus()` in
 * `Cubism2InternalModel` / `Cubism4InternalModel`), so writing `ParamEyeBallX/Y`
 * here as well would leave the eyes with two disagreeing drivers while the head
 * followed only one of them.
 *
 * Not using any reactivity here as it's not yet needed.
 * Keeping it here as a composable for future extension.
 */
export function useLive2DIdleEyeFocus() {
  let lastSaccadeAtMs = -1
  let nextSaccadeAtMs = -1

  function update(model: InternalModel, nowMs: number) {
    // The second condition re-arms a schedule stranded in the future, which
    // happens if this composable ever outlives the model clock it was primed
    // against.
    if (nowMs >= nextSaccadeAtMs || nowMs < lastSaccadeAtMs) {
      const targetX = MathUtils.randFloat(-1, 1)
      // Biased downward: looking up past 0.7 reads as staring at the ceiling.
      const targetY = MathUtils.randFloat(-1, 0.7)

      lastSaccadeAtMs = nowMs
      // `randomSaccadeInterval()` already returns milliseconds.
      nextSaccadeAtMs = nowMs + randomSaccadeInterval()

      // Half amplitude: `updateFocus()` scales these by 30 for the head angles,
      // so a full-range target reads as an exaggerated head swing rather than a
      // glance.
      model.focusController.focus(targetX * 0.5, targetY * 0.5, false)
    }

    // `focusController.update(dt)` is deliberately not called here.
    // `InternalModel.update` already advances the interpolator once per frame,
    // before it delegates to `motionManager.update` (`dist/cubism2.es.js`).
    // Calling it again integrated the same spring twice per frame, and with the
    // time since the last saccade as the step instead of the frame delta.
  }

  return { update }
}
