import type { ElectronAPI } from '@electron-toolkit/preload'

declare global {
  interface Window {
    electron: ElectronAPI
    platform: NodeJS.Platform
    api: unknown
  }
}
