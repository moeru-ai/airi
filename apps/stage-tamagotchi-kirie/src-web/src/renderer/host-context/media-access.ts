import type { Ref } from 'vue'

import { useHostMicrophonePermission } from './microphone-permission'

export type HostMediaAccessStatus = 'not-determined' | 'granted' | 'denied' | 'restricted' | 'unknown'

export function useHostMediaAccessStatus(_type: 'microphone'): Readonly<Ref<HostMediaAccessStatus>> {
  const permission = useHostMicrophonePermission()
  permission.refresh().catch((error) => {
    console.warn('[host-context] Failed to read microphone permission state:', error)
  })
  return permission.status
}
