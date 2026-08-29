import type { Live2DMotionMagicProfileId } from './profiles'

import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { defineStore } from 'pinia'
import { watch } from 'vue'

import { defaultLive2DMotionMagicProfileId, live2dMotionMagicProfiles } from './profiles'

const profileId = useLocalStorageManualReset('settings/live2d/magic/profile', defaultLive2DMotionMagicProfileId)
const skipMouthOpen = useLocalStorageManualReset('settings/live2d/magic/skip-mouth-open', true)
const forceViewTarget = useLocalStorageManualReset('settings/live2d/magic/force-view-target', true)

function isKnownProfileId(value: unknown): value is Live2DMotionMagicProfileId {
  return typeof value === 'string' && Object.hasOwn(live2dMotionMagicProfiles, value)
}

watch(profileId, (value) => {
  // Persisted settings can outlive bundled profiles. Restore the default before runtime consumers
  // use the ID to access the profile registry.
  if (!isKnownProfileId(value))
    profileId.value = defaultLive2DMotionMagicProfileId
}, { flush: 'sync', immediate: true })

/** Persists production settings for the MAGIC Live2D motion driver. */
export const useLive2DMotionMagicSettings = defineStore('settings-live2d-motion-magic', () => {
  function resetState() {
    profileId.value = defaultLive2DMotionMagicProfileId
    skipMouthOpen.value = true
    forceViewTarget.value = true
  }

  return {
    profileId,
    skipMouthOpen,
    forceViewTarget,
    resetState,
  }
})
