import { defineStore } from 'pinia'
import { shallowRef, watch } from 'vue'

import { useModsServerChannelStore } from './channel-server'
import { resolveInputScene, useModuleDirectoryStore } from './module-directory'

/** One active speech output device, such as a Discord voice channel. */
export interface SpeechDevice {
  binding: string
  connectionId: string
}

/** Output channel name for a device in a run envelope. */
export function speechDeviceOutput(binding: string) {
  return `voice-device:${binding}`
}

/**
 * Speech devices that modules offer for their declared scenes.
 *
 * Use when:
 * - A run envelope decides where the voice reaches, and the stage forwards speech to a device.
 *
 * Expects:
 * - Each renderer calls {@link listen} once while its server channel runs.
 *
 * Returns:
 * - Active devices. A device from a module without a matching declared scene is ignored. A module that leaves loses its devices.
 */
export const useSpeechDeviceStore = defineStore('mods:api:speech-device', () => {
  const serverChannel = useModsServerChannelStore()
  const directory = useModuleDirectoryStore()
  const devices = shallowRef<SpeechDevice[]>([])

  /** Returns the active device for one of the bindings. */
  function forBindings(bindings: readonly string[]) {
    return devices.value.find(device => bindings.includes(device.binding))
  }

  function listen() {
    const stopDevices = serverChannel.onEvent('speech:device', (event) => {
      const connectionId = event.metadata?.originConnectionId
      const module = directory.byConnection(connectionId)
      // Only a module with a declared scene can put speech there. The voice then reaches that scene's members.
      if (!connectionId || !module?.cognition?.scenes?.length || !resolveInputScene(module, { binding: event.data.binding }).ok)
        return
      const others = devices.value.filter(device => device.binding !== event.data.binding)
      devices.value = event.data.active ? [...others, { binding: event.data.binding, connectionId }] : others
    })
    const stopPruning = watch(() => directory.modules, (modules) => {
      const connections = new Set(modules.map(module => module.connectionId))
      if (devices.value.some(device => !connections.has(device.connectionId)))
        devices.value = devices.value.filter(device => connections.has(device.connectionId))
    })
    return () => {
      stopDevices()
      stopPruning()
    }
  }

  return {
    devices,
    forBindings,
    listen,
  }
})
