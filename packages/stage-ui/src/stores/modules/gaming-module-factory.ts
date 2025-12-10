import { defineStore } from 'pinia'
import { computed } from 'vue'

import { createResettableLocalStorage } from '../../utils/resettable'
import { useConfiguratorByModsChannelServer } from '../configurator'

export function createGamingModuleStore(moduleName: string, defaultPort: number) {
  return defineStore(moduleName, () => {
    const configurator = useConfiguratorByModsChannelServer()

    const [enabled, resetEnabled] = createResettableLocalStorage(`settings/${moduleName}/enabled`, false)
    const [serverAddress, resetServerAddress] = createResettableLocalStorage(`settings/${moduleName}/server-address`, '')
    const [serverPort, resetServerPort] = createResettableLocalStorage<number | null>(`settings/${moduleName}/server-port`, defaultPort)
    const [username, resetUsername] = createResettableLocalStorage(`settings/${moduleName}/username`, '')

    function saveSettings() {
      configurator.updateFor(moduleName, {
        enabled: enabled.value,
        serverAddress: serverAddress.value,
        serverPort: serverPort.value,
        username: username.value,
      })
    }

    function resetState() {
      resetEnabled()
      resetServerAddress()
      resetServerPort()
      resetUsername()
      saveSettings()
    }

    const configured = computed(() => {
      return !!(serverAddress.value.trim() && username.value.trim() && serverPort.value !== null)
    })

    return { enabled, serverAddress, serverPort, username, configured, saveSettings, resetState }
  })
}
