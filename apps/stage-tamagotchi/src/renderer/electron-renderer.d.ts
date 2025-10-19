declare global {
  interface Window {
    electron: import('@electron-toolkit/preload').ElectronAPI
    platform: NodeJS.Platform
  }
}

export {}
