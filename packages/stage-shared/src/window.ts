import type { ElectronAPI } from '@electron-toolkit/preload'

import { isStageTamagotchi } from './environment'

export interface ElectronWindow {
  electron: ElectronAPI
  platform: NodeJS.Platform
  api: unknown
}

export function isElectronWindow(window: Window): window is (Window & ElectronWindow) {
  return isStageTamagotchi() && typeof window === 'object' && window !== null && 'electron' in window
}
