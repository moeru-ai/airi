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
      const hasAddress = Boolean(serverAddress.value.trim())
      const hasUsername = Boolean(username.value.trim())
      const hasPort = serverPort.value !== null
      const canProceed = hasAddress && hasUsername && hasPort
      return canProceed
    })

    return { enabled, serverAddress, serverPort, username, configured, saveSettings, resetState }
  })
}
