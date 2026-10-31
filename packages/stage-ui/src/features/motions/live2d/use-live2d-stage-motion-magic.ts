import type { MaybeRefOrGetter } from 'vue'

import { defaultLive2DMotionControlDynamics, useLive2DMotionControl } from '@proj-airi/stage-ui-live2d'
import { storeToRefs } from 'pinia'
import { toValue, watch } from 'vue'

import { live2dMotionMagicProfiles } from './profiles'
import { useLive2DMotionMagicSettings } from './settings'
import { useLive2DMotionMagic } from './use-live2d-motion-magic'

/**
 * Runs the MAGIC motion driver for one Live2D scene.
 *
 * Each renderer that shows the character runs its own driver and keeps the
 * poses in its own window. The main stage and a settings preview then both
 * move, and two windows do not replace the poses of each other. A devtools
 * window that claims exclusive control pauses every driver.
 */
export function useLive2DStageMotionMagic(options: {
  /** The scene shows a Live2D model with the MAGIC driver, and is not paused. */
  active: MaybeRefOrGetter<boolean>
}) {
  const motionControl = useLive2DMotionControl()
  const { exclusiveOwnerId } = storeToRefs(motionControl)
  const { forceViewTarget, profileId, skipMouthOpen } = storeToRefs(useLive2DMotionMagicSettings())
  const ownerId = `stage:live2d-motion-magic:${Math.random().toString(36).slice(2, 10)}`
  const localDelivery = { broadcast: false }

  const magic = useLive2DMotionMagic({
    dataset: () => live2dMotionMagicProfiles[profileId.value].dataset,
    forceViewTarget,
    skipMouthOpen,
    disabled: () => exclusiveOwnerId.value !== null,
    publishPose: pose => motionControl.setPose(ownerId, pose, defaultLive2DMotionControlDynamics, localDelivery),
    releasePose: () => motionControl.release(ownerId, localDelivery),
  })
  let activationRequest = 0

  watch(
    [() => toValue(options.active), profileId, exclusiveOwnerId],
    async ([active, , controlOwnerId]) => {
      const request = ++activationRequest
      if (!active || controlOwnerId !== null) {
        magic.stop()
        return
      }

      if (magic.status.value === 'idle')
        await magic.initialize()

      if (request !== activationRequest || !toValue(options.active) || exclusiveOwnerId.value !== null)
        return

      magic.start()
    },
    { immediate: true },
  )

  return magic
}
