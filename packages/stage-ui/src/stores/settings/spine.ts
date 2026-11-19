import { useLocalStorageManualReset, useModelScopedLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { defineStore } from 'pinia'

export const useSettingsSpine = defineStore('settings-spine', () => {
  const spinePremultipliedAlpha = useModelScopedLocalStorageManualReset<boolean>('spine', 'settings/spine/premultiplied-alpha', true)
  const spineDefaultMixDuration = useModelScopedLocalStorageManualReset<number>('spine', 'settings/spine/default-mix', 0.2)
  const spineIdleAnimationEnabled = useModelScopedLocalStorageManualReset<boolean>('spine', 'settings/spine/idle-enabled', true)
  const spineMaxFps = useLocalStorageManualReset<number>('settings/spine/max-fps', 0)
  const spineRenderScale = useLocalStorageManualReset<number>('settings/spine/render-scale', 1)

  function resetState() {
    spinePremultipliedAlpha.reset()
    spineDefaultMixDuration.reset()
    spineIdleAnimationEnabled.reset()
    spineMaxFps.reset()
    spineRenderScale.reset()
  }

  return {
    spinePremultipliedAlpha,
    spineDefaultMixDuration,
    spineIdleAnimationEnabled,
    spineMaxFps,
    spineRenderScale,

    resetState,
  }
})
