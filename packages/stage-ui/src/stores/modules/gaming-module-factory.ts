import { useLocalStorage } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed } from 'vue'

import { useConfiguratorForAiriSdk } from '../configurator'

export function createGamingModuleStore(moduleName: string, defaultPort: number) {
  return defineStore(moduleName, () => {
    const configurator = useConfiguratorForAiriSdk()

    const enabled = useLocalStorage(`settings/${moduleName}/enabled`, false)
    const serverAddress = useLocalStorage(`settings/${moduleName}/server-address`, '')
    const serverPort = useLocalStorage<number | null>(`settings/${moduleName}/server-port`, defaultPort)
    const username = useLocalStorage(`settings/${moduleName}/username`, '')

    function saveSettings() {
      configurator.updateFor(moduleName, {
        enabled: enabled.value,
        serverAddress: serverAddress.value,
        serverPort: serverPort.value,
        username: username.value,
      })
    }

    const configured = computed(() => {
      return !!(serverAddress.value.trim() && username.value.trim() && serverPort.value !== null)
    })

    return { enabled, serverAddress, serverPort, username, configured, saveSettings }
  })
}
