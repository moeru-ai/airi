import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { defineStore } from 'pinia'
import { computed } from 'vue'

import { useConfiguratorByModsChannelServer } from '../configurator'

export const useMatrixStore = defineStore('matrix', () => {
  const configurator = useConfiguratorByModsChannelServer()
  const enabled = useLocalStorageManualReset<boolean>('settings/matrix/enabled', false)
  const homeserverUrl = useLocalStorageManualReset<string>('settings/matrix/homeserverUrl', 'https://matrix.org')
  const accessToken = useLocalStorageManualReset<string>('settings/matrix/accessToken', '')
  const userId = useLocalStorageManualReset<string>('settings/matrix/userId', '')

  function saveSettings() {
    configurator.updateFor('matrix', {
      enabled: enabled.value,
      homeserverUrl: homeserverUrl.value,
      accessToken: accessToken.value,
      userId: userId.value,
    })
  }

  const configured = computed(() => {
    return !!accessToken.value.trim() && !!userId.value.trim() && !!homeserverUrl.value.trim()
  })

  function resetState() {
    enabled.reset()
    homeserverUrl.reset()
    accessToken.reset()
    userId.reset()
    saveSettings()
  }

  return {
    enabled,
    homeserverUrl,
    accessToken,
    userId,
    configured,
    saveSettings,
    resetState,
  }
})
