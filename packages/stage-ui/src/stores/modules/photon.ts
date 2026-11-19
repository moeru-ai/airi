import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { defineStore } from 'pinia'
import { computed } from 'vue'

import { useConfiguratorByModsChannelServer } from '../configurator'

export const usePhotonStore = defineStore('photon', () => {
  const configurator = useConfiguratorByModsChannelServer()
  const enabled = useLocalStorageManualReset<boolean>('settings/photon/enabled', false)
  const projectId = useLocalStorageManualReset<string>('settings/photon/project-id', '')
  const apiKey = useLocalStorageManualReset<string>('settings/photon/api-key', '')

  /** Sends the settings to the `photon` module, which is the bot in `integrations/photon-bot`. */
  function saveSettings() {
    configurator.updateFor('photon', {
      enabled: enabled.value,
      projectId: projectId.value.trim(),
      apiKey: apiKey.value.trim(),
    })
  }

  const configured = computed(() => {
    return !!(projectId.value.trim() && apiKey.value.trim())
  })

  function resetState() {
    enabled.reset()
    projectId.reset()
    apiKey.reset()
    saveSettings()
  }

  return {
    enabled,
    projectId,
    apiKey,
    configured,
    saveSettings,
    resetState,
  }
})
