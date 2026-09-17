import type { Ref } from 'vue'

import { defineInvoke } from '@moeru/eventa'
import { electron } from '@proj-airi/electron-eventa'
import { useAsyncState } from '@vueuse/core'

import { useHostMicrophonePermission } from './microphone-permission'
import { initializeHostContext } from './owner'

export type HostMediaAccessStatus = 'not-determined' | 'granted' | 'denied' | 'restricted' | 'unknown'

export function useHostMediaAccessStatus(type: 'microphone'): Readonly<Ref<HostMediaAccessStatus>> {
  const host = initializeHostContext()
  if (host.runtime === 'electron') {
    const getStatus = defineInvoke(host.context, electron.systemPreferences.getMediaAccessStatus)
    return useAsyncState(() => getStatus([type]), 'not-determined').state
  }

  const permission = useHostMicrophonePermission()
  void permission.refresh().catch((error) => {
    console.warn('[host-context] Failed to read microphone permission state:', error)
  })
  return permission.status
}
