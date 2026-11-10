import type { ElectronAuthStatus } from '../../shared/eventa'

import { defineStore } from 'pinia'
import { shallowRef } from 'vue'

/** Display state from the main process; never persisted or Pinia-synchronized. */
export const useAuthStatusStore = defineStore('electron-auth-status', () => {
  const status = shallowRef<ElectronAuthStatus>()
  return { status }
})
