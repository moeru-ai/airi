import type { MetadataEventSource, WebSocketBaseEvent, WebSocketEvents } from '@proj-airi/server-sdk'

import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { useConfiguratorByModsChannelServer } from '../configurator'
import { useModsServerChannelStore } from '../mods/api/channel-server'

const X_MODULE_NAME = 'x'

function isXModuleIdentity(value: { name?: string, identity?: MetadataEventSource }) {
  return value.name === X_MODULE_NAME || value.identity?.id === X_MODULE_NAME
}

/** Tracks X service availability and delivers its credential configuration. */
export const useTwitterStore = defineStore('twitter', () => {
  const configurator = useConfiguratorByModsChannelServer()
  const serverChannelStore = useModsServerChannelStore()

  const enabled = useLocalStorageManualReset<boolean>('settings/twitter/enabled', false)
  const apiKey = useLocalStorageManualReset<string>('settings/twitter/api-key', '')
  const apiSecret = useLocalStorageManualReset<string>('settings/twitter/api-secret', '')
  const accessToken = useLocalStorageManualReset<string>('settings/twitter/access-token', '')
  const accessTokenSecret = useLocalStorageManualReset<string>('settings/twitter/access-token-secret', '')
  const initialized = ref(false)
  const servicePresent = ref(false)
  const serviceHealthy = ref(false)

  let disposeRegistrySync: (() => void) | null = null
  let disposeRegistryHealthy: (() => void) | null = null
  let disposeRegistryUnhealthy: (() => void) | null = null
  let disposeModuleDeAnnounced: (() => void) | null = null

  const configured = computed(() => servicePresent.value && serviceHealthy.value)

  function handleRegistrySync(event: WebSocketBaseEvent<'registry:modules:sync', WebSocketEvents['registry:modules:sync']>) {
    const wasPresent = servicePresent.value
    servicePresent.value = event.data.modules.some(isXModuleIdentity)

    if (!servicePresent.value) {
      serviceHealthy.value = false
      return
    }

    if (!wasPresent)
      serviceHealthy.value = true
  }

  function handleRegistryHealthy(event: WebSocketBaseEvent<'registry:modules:health:healthy', WebSocketEvents['registry:modules:health:healthy']>) {
    if (!isXModuleIdentity(event.data))
      return

    servicePresent.value = true
    serviceHealthy.value = true
  }

  function handleRegistryUnhealthy(event: WebSocketBaseEvent<'registry:modules:health:unhealthy', WebSocketEvents['registry:modules:health:unhealthy']>) {
    if (!isXModuleIdentity(event.data))
      return

    servicePresent.value = true
    serviceHealthy.value = false
  }

  function handleModuleDeAnnounced(event: WebSocketBaseEvent<'module:de-announced', WebSocketEvents['module:de-announced']>) {
    if (!isXModuleIdentity(event.data))
      return

    servicePresent.value = false
    serviceHealthy.value = false
  }

  function initialize() {
    if (initialized.value)
      return

    initialized.value = true
    disposeRegistrySync = serverChannelStore.onEvent('registry:modules:sync', handleRegistrySync)
    disposeRegistryHealthy = serverChannelStore.onEvent('registry:modules:health:healthy', handleRegistryHealthy)
    disposeRegistryUnhealthy = serverChannelStore.onEvent('registry:modules:health:unhealthy', handleRegistryUnhealthy)
    disposeModuleDeAnnounced = serverChannelStore.onEvent('module:de-announced', handleModuleDeAnnounced)
  }

  function dispose() {
    disposeRegistrySync?.()
    disposeRegistryHealthy?.()
    disposeRegistryUnhealthy?.()
    disposeModuleDeAnnounced?.()
    disposeRegistrySync = null
    disposeRegistryHealthy = null
    disposeRegistryUnhealthy = null
    disposeModuleDeAnnounced = null
    initialized.value = false
  }

  function saveSettings() {
    // Data is automatically saved to localStorage via useLocalStorage
    // Also broadcast configuration to backend
    configurator.updateFor(X_MODULE_NAME, {
      enabled: enabled.value,
      apiKey: apiKey.value,
      apiSecret: apiSecret.value,
      accessToken: accessToken.value,
      accessTokenSecret: accessTokenSecret.value,
    })
  }

  function resetState() {
    enabled.reset()
    apiKey.reset()
    apiSecret.reset()
    accessToken.reset()
    accessTokenSecret.reset()
    saveSettings()
  }

  return {
    enabled,
    apiKey,
    apiSecret,
    accessToken,
    accessTokenSecret,
    configured,
    initialize,
    dispose,
    saveSettings,
    resetState,
  }
})
