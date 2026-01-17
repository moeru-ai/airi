import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { defineStore } from 'pinia'
import { computed } from 'vue'

import { useConfiguratorByModsChannelServer } from '../configurator'

export function createGamingModuleStore(moduleName: string, defaultPort: number) {
  return defineStore(moduleName, () => {
    const configurator = useConfiguratorByModsChannelServer()

    const enabled = useLocalStorageManualReset<boolean>(`settings/${moduleName}/enabled`, false)
    const serverAddress = useLocalStorageManualReset<string>(`settings/${moduleName}/server-address`, '')
    const serverPort = useLocalStorageManualReset<number | null>(`settings/${moduleName}/server-port`, defaultPort)
    const username = useLocalStorageManualReset<string>(`settings/${moduleName}/username`, '')

    function saveSettings() {
      configurator.updateFor(moduleName, {
        enabled: enabled.value,
        serverAddress: serverAddress.value,
        serverPort: serverPort.value,
        username: username.value,
      })
    }

    function resetState() {
      enabled.reset()
      serverAddress.reset()
      serverPort.reset()
      username.reset()
      saveSettings()
    }

    const configured = computed(() => {
      return !!(serverAddress.value.trim() && username.value.trim() && serverPort.value !== null)
    })

    return { enabled, serverAddress, serverPort, username, configured, saveSettings, resetState }
  })
}
