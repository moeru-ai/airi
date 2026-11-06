import type { MaybeRefOrGetter } from 'vue'

import { defaultLive2DMotionControlDynamics, useLive2DMotionControl } from '@proj-airi/stage-ui-live2d'
import { storeToRefs } from 'pinia'
import { computed, onScopeDispose, toValue, watch } from 'vue'

import { live2dMotionMagicProfiles } from './profiles'
import { useLive2DMotionMagicSettings } from './settings'
import { useLive2DMotionSpeechActivity } from './speech-activity'
import { useLive2DMotionMagic } from './use-live2d-motion-magic'

/**
 * Length of the blend into the speaking profile, in milliseconds.
 *
 * The bundled speaking profile moves about three times as much on each frame
 * as the idle profile. A blend under one second reads as a cut.
 */
export const live2dMotionMagicSpeakingTransitionMs = 1600
/** Length of the blend back to the idle profile, in milliseconds. A slower return reads as calming down. */
export const live2dMotionMagicIdleTransitionMs = 3000

/**
 * Runs the MAGIC motion driver for one Live2D scene.
 *
 * Each renderer that shows the character runs its own driver and keeps the
 * poses in its own window. The main stage and a settings preview then both
 * move, and two windows do not replace the poses of each other. A devtools
 * window that claims exclusive control pauses every driver.
 *
 * With "follow speech" on, the voice output on the speech bus selects the
 * speaking profile, and the driver blends between the two profiles.
 */
export function useLive2DStageMotionMagic(options: {
  /** The scene shows a Live2D model with the MAGIC driver, and is not paused. */
  active: MaybeRefOrGetter<boolean>
}) {
  const motionControl = useLive2DMotionControl()
  const { exclusiveOwnerId } = storeToRefs(motionControl)
  const {
    followSpeech,
    forceViewTarget,
    idleProfileId,
    skipMouthOpen,
    speakingProfileId,
  } = storeToRefs(useLive2DMotionMagicSettings())
  const speechActivity = useLive2DMotionSpeechActivity()
  const profileId = computed(() => followSpeech.value && speechActivity.value === 'speaking'
    ? speakingProfileId.value
    : idleProfileId.value)
  const ownerId = `stage:live2d-motion-magic:${Math.random().toString(36).slice(2, 10)}`
  const localDelivery = { broadcast: false }

  const magic = useLive2DMotionMagic({
    dataset: () => live2dMotionMagicProfiles[profileId.value].dataset,
    transitionMs: () => speechActivity.value === 'speaking'
      ? live2dMotionMagicSpeakingTransitionMs
      : live2dMotionMagicIdleTransitionMs,
    forceViewTarget,
    skipMouthOpen,
    disabled: () => exclusiveOwnerId.value !== null,
    publishPose: pose => motionControl.setPose(ownerId, pose, defaultLive2DMotionControlDynamics, localDelivery),
    releasePose: () => motionControl.release(ownerId, localDelivery),
  })
  let prepareTimer: ReturnType<typeof setTimeout> | undefined

  function prepareProfiles() {
    if (prepareTimer !== undefined)
      return

    // The fit runs on the main thread. A separate task keeps it off the first frame of playback.
    prepareTimer = setTimeout(() => {
      prepareTimer = undefined
      magic.prepare(live2dMotionMagicProfiles[idleProfileId.value].dataset)
      if (followSpeech.value)
        magic.prepare(live2dMotionMagicProfiles[speakingProfileId.value].dataset)
    }, 0)
  }

  watch(
    [() => toValue(options.active), exclusiveOwnerId, magic.status],
    async ([active, controlOwnerId, status]) => {
      if (!active || controlOwnerId !== null) {
        magic.stop()
        return
      }

      // A failed fit stays failed until the dataset or the method changes.
      if (status === 'idle' && !magic.error.value) {
        await magic.initialize()
        return
      }

      if (status === 'ready') {
        magic.start()
        prepareProfiles()
      }
    },
    { immediate: true },
  )

  onScopeDispose(() => {
    if (prepareTimer !== undefined)
      clearTimeout(prepareTimer)
  })

  return {
    magic,
    profileId,
    speechActivity,
  }
}
