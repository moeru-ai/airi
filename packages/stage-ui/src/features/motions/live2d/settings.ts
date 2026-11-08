import type { Live2DMotionMagicProfileId } from './profiles'

import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { defineStore } from 'pinia'
import { watch } from 'vue'

import { live2dMotionMagicProfiles } from './profiles'

/** Profile played while AIRI does not speak. */
export const defaultLive2DMotionMagicIdleProfileId: Live2DMotionMagicProfileId = 'idle-calm'
/** Profile played while a response generates text or plays speech. */
export const defaultLive2DMotionMagicSpeakingProfileId: Live2DMotionMagicProfileId = 'speaking-excited'

const idleProfileId = useLocalStorageManualReset<Live2DMotionMagicProfileId>('settings/live2d/magic/idle-profile', defaultLive2DMotionMagicIdleProfileId)
const speakingProfileId = useLocalStorageManualReset<Live2DMotionMagicProfileId>('settings/live2d/magic/speaking-profile', defaultLive2DMotionMagicSpeakingProfileId)
const followSpeech = useLocalStorageManualReset('settings/live2d/magic/follow-speech', true)
const skipMouthOpen = useLocalStorageManualReset('settings/live2d/magic/skip-mouth-open', true)
const forceViewTarget = useLocalStorageManualReset('settings/live2d/magic/force-view-target', true)

function isKnownProfileId(value: unknown): value is Live2DMotionMagicProfileId {
  return typeof value === 'string' && Object.hasOwn(live2dMotionMagicProfiles, value)
}

// Persisted settings can outlive bundled profiles. Restore the default before runtime consumers
// use the ID to access the profile registry.
watch(idleProfileId, (value) => {
  if (!isKnownProfileId(value))
    idleProfileId.value = defaultLive2DMotionMagicIdleProfileId
}, { flush: 'sync', immediate: true })
watch(speakingProfileId, (value) => {
  if (!isKnownProfileId(value))
    speakingProfileId.value = defaultLive2DMotionMagicSpeakingProfileId
}, { flush: 'sync', immediate: true })

/** Persists production settings for the MAGIC Live2D motion driver. */
export const useLive2DMotionMagicSettings = defineStore('settings-live2d-motion-magic', () => {
  function resetState() {
    idleProfileId.reset()
    speakingProfileId.reset()
    followSpeech.reset()
    skipMouthOpen.reset()
    forceViewTarget.reset()
  }

  return {
    idleProfileId,
    speakingProfileId,
    followSpeech,
    skipMouthOpen,
    forceViewTarget,
    resetState,
  }
})
