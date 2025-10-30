import type { ElectronWindow } from '@proj-airi/stage-shared'

import { contextIsolated, platform } from 'node:process'

import { electronAPI } from '@electron-toolkit/preload'
import { contextBridge } from 'electron'

export function expose<CustomApi = unknown>(customApi: CustomApi = undefined as CustomApi) {
  // Use `contextBridge` APIs to expose Electron APIs to
  // renderer only if context isolation is enabled, otherwise
  // just add to the DOM global.
  if (contextIsolated) {
    try {
      contextBridge.exposeInMainWorld('electron', electronAPI)
      contextBridge.exposeInMainWorld('platform', platform)
      contextBridge.exposeInMainWorld('api', customApi)
    }
    catch (error) {
      console.error(error)
    }
  }
  else {
    window.electron = electronAPI
    window.platform = platform
    ;(window as ElectronWindow<CustomApi>).api = customApi
  }
}
