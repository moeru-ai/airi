import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { defineStore } from 'pinia'

/**
 * Account copy switches. Both default to on, so sign-in keeps the current
 * sync behavior. Off pauses the network copy. Local data stays on this device.
 * Turning a switch on again resumes that copy.
 */
export const useSettingsCloudSync = defineStore('settings-cloud-sync', () => {
  const providerListSyncEnabled = useLocalStorageManualReset<boolean>('settings/cloud-sync/provider-list', true)
  const chatMessagesSyncEnabled = useLocalStorageManualReset<boolean>('settings/cloud-sync/chat-messages', true)

  function resetState() {
    providerListSyncEnabled.reset()
    chatMessagesSyncEnabled.reset()
  }

  return {
    providerListSyncEnabled,
    chatMessagesSyncEnabled,
    resetState,
  }
})
