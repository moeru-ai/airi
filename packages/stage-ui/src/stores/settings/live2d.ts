import { refManualReset, useLocalStorage } from '@vueuse/core'
import { defineStore } from 'pinia'

export const useSettingsLive2d = defineStore('settings-live2d', () => {
  const live2dDisableFocus = refManualReset<boolean>(useLocalStorage<boolean>('settings/live2d/disable-focus', false))
  const live2dIdleAnimationEnabled = refManualReset<boolean>(useLocalStorage<boolean>('settings/live2d/idle-animation-enabled', true))
  const live2dAutoBlinkEnabled = refManualReset<boolean>(useLocalStorage<boolean>('settings/live2d/auto-blink-enabled', true))
  const live2dForceAutoBlinkEnabled = refManualReset<boolean>(useLocalStorage<boolean>('settings/live2d/force-auto-blink-enabled', false))
  const live2dShadowEnabled = refManualReset<boolean>(useLocalStorage<boolean>('settings/live2d/shadow-enabled', true))

  function resetState() {
    live2dDisableFocus.reset()
    live2dIdleAnimationEnabled.reset()
    live2dAutoBlinkEnabled.reset()
    live2dForceAutoBlinkEnabled.reset()
    live2dShadowEnabled.reset()
  }

  return {
    live2dDisableFocus,
    live2dIdleAnimationEnabled,
    live2dAutoBlinkEnabled,
    live2dForceAutoBlinkEnabled,
    live2dShadowEnabled,
    resetState,
  }
})
