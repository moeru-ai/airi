import type { ElectronAPI } from '@electron-toolkit/preload'

import { isStageTamagotchi } from './environment'

export interface ElectronWindow<CustomApi = unknown> {
  electron: ElectronAPI
  platform: NodeJS.Platform
  api: CustomApi
}

export function isElectronWindow<CustomApi = unknown>(window: Window): window is Window & ElectronWindow<CustomApi> {
  const isStageApp = isStageTamagotchi()
  const isObject = typeof window === 'object' && window !== null
  return isStageApp && isObject && 'electron' in window
}
