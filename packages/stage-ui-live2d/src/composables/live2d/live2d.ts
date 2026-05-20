import type { ComputedRef, Ref } from 'vue'

import { useLocalStorageManualReset, useVersionedLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { defineStore } from 'pinia'
import { ref } from 'vue'

const live2dEyeTracking = useLocalStorageManualReset<boolean>('settings/live2d/disable-focus', false)
/**
 * A position to perform eye-tracking on.
 * Should be a position relative to the application window:
 * - for browser targets, it should be the top-left corner of the viewport
 * - for tamagotchi targets, it should be the top-left corner of
 * the application window that renders the model
 */
const live2dEyeTrackingSource: Ref<ComputedRef<{ x: number, y: number }> | null> = ref(null)
/** Offset from model center to the eyes of the model. */
const live2dModelEyeOffset = useLocalStorageManualReset('settings/live2d/model-eye-offset', { x: 0, y: 0 })
const live2dIdleAnimationEnabled = useLocalStorageManualReset<boolean>('settings/live2d/idle-animation-enabled', true)
const live2dForceIdleEyeAnimation = useLocalStorageManualReset<boolean>('settings/live2d/idle-eye-animation-enabled', false)
const live2dAutoBlinkEnabled = useVersionedLocalStorageManualReset<boolean>('settings/live2d/auto-blink-enabled', false, {
  defaultVersion: '2.0.0',
  satisfiesVersionBy(beforeVersion, afterVersion) {
    if (beforeVersion === afterVersion) {
      return true
    }

    return false
  },
})
const live2dForceAutoBlinkEnabled = useVersionedLocalStorageManualReset<boolean>('settings/live2d/force-auto-blink-enabled', true, {
  defaultVersion: '2.0.0',
  satisfiesVersionBy(beforeVersion, afterVersion) {
    if (beforeVersion === afterVersion) {
      return true
    }

    return false
  },
})
const live2dExpressionEnabled = useLocalStorageManualReset<boolean>('settings/live2d/expression-enabled', false)
const live2dShadowEnabled = useLocalStorageManualReset<boolean>('settings/live2d/shadow-enabled', true)
const live2dMaxFps = useLocalStorageManualReset<number>('settings/live2d/max-fps', 0)
const live2dRenderScale = useLocalStorageManualReset<number>('settings/live2d/render-scale', 2)

function resetState() {
  live2dEyeTracking.reset()
  live2dModelEyeOffset.reset()
  live2dIdleAnimationEnabled.reset()
  live2dForceIdleEyeAnimation.reset()
  live2dAutoBlinkEnabled.reset()
  live2dForceAutoBlinkEnabled.reset()
  live2dExpressionEnabled.reset()
  live2dShadowEnabled.reset()
  live2dMaxFps.reset()
  live2dRenderScale.reset()
}

export const useSettingsLive2d = defineStore('settings-live2d', () => {
  return {
    live2dEyeTracking,
    live2dEyeTrackingSource,
    live2dModelEyeOffset,
    live2dIdleAnimationEnabled,
    live2dForceIdleEyeAnimation,
    live2dAutoBlinkEnabled,
    live2dForceAutoBlinkEnabled,
    live2dExpressionEnabled,
    live2dShadowEnabled,
    live2dMaxFps,
    live2dRenderScale,
    resetState,
  }
})
