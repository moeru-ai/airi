import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { defineStore } from 'pinia'

export const useSettingsAnalytics = defineStore('settings-analytics', () => {
  const analyticsEnabled = useLocalStorageManualReset<boolean>('settings/analytics/enabled', true)

  function resetState() {
    analyticsEnabled.reset()
  }

  return {
    analyticsEnabled,
    resetState,
  }
})
