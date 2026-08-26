import type { ElectronAPI } from '@electron-toolkit/preload'

import { isStageTamagotchi } from './environment'

export interface ElectronWindow<CustomApi = unknown> {
  api: CustomApi
  electron: ElectronAPI
  platform: NodeJS.Platform
}

export function isElectronWindow<CustomApi = unknown>(window: Window): window is (ElectronWindow<CustomApi> & Window) {
  return isStageTamagotchi() && typeof window === 'object' && window !== null && 'electron' in window
}
