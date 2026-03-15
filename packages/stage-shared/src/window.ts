import type { ElectronAPI } from '@electron-toolkit/preload'

import { isStageTamagotchi } from './environment'

export interface ElectronWindow<CustomApi = unknown> {
  electron: ElectronAPI
  platform: NodeJS.Platform
  api: CustomApi
}

export function isElectronWindow<CustomApi = unknown>(window: Window): window is (Window & ElectronWindow<CustomApi>) {
  return isStageTamagotchi() && typeof window === 'object' && window !== null && 'electron' in window
}
