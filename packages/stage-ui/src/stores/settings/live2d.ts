import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { defineStore } from 'pinia'

export const useSettingsLive2d = defineStore('settings-live2d', () => {
  const live2dDisableFocus = useLocalStorageManualReset<boolean>('settings/live2d/disable-focus', false)
  const live2dIdleAnimationEnabled = useLocalStorageManualReset<boolean>('settings/live2d/idle-animation-enabled', true)
  const live2dAutoBlinkEnabled = useLocalStorageManualReset<boolean>('settings/live2d/auto-blink-enabled', true)
  const live2dForceAutoBlinkEnabled = useLocalStorageManualReset<boolean>('settings/live2d/force-auto-blink-enabled', false)
  const live2dExpressionEnabled = useLocalStorageManualReset<boolean>('settings/live2d/expression-enabled', false)
  const live2dShadowEnabled = useLocalStorageManualReset<boolean>('settings/live2d/shadow-enabled', true)
  const live2dMaxFps = useLocalStorageManualReset<number>('settings/live2d/max-fps', 0)

  function resetState() {
    live2dDisableFocus.reset()
    live2dIdleAnimationEnabled.reset()
    live2dAutoBlinkEnabled.reset()
    live2dForceAutoBlinkEnabled.reset()
    live2dExpressionEnabled.reset()
    live2dShadowEnabled.reset()
    live2dMaxFps.reset()
  }

  return {
    live2dDisableFocus,
    live2dIdleAnimationEnabled,
    live2dAutoBlinkEnabled,
    live2dForceAutoBlinkEnabled,
    live2dExpressionEnabled,
    live2dShadowEnabled,
    live2dMaxFps,
    resetState,
  }
})
