import type { ElectronWindow } from '@proj-airi/stage-shared'

import { contextIsolated, platform } from 'node:process'

import { electronAPI } from '@electron-toolkit/preload'
import { contextBridge, ipcRenderer } from 'electron'

// Always-on-top window controls API interface
export interface AlwaysOnTopAPI {
  set: (enabled: boolean) => Promise<boolean>
  get: () => Promise<boolean>
}

export const alwaysOnTopAPI: AlwaysOnTopAPI = {
  set: (enabled: boolean) => ipcRenderer.invoke('window:set-always-on-top', enabled),
  get: () => ipcRenderer.invoke('window:get-always-on-top'),
}

export function expose() {
  // TODO: once we refactored eventa to support window-namespaced contexts,
  // we can remove the setMaxListeners call below since eventa will be able to dispatch and
  // manage events within eventa's context system.
  ipcRenderer.setMaxListeners(0)

  // Use `contextBridge` APIs to expose Electron APIs to
  // renderer only if context isolation is enabled, otherwise
  // just add to the DOM global.
  if (contextIsolated) {
    try {
      contextBridge.exposeInMainWorld('electron', electronAPI)
      contextBridge.exposeInMainWorld('platform', platform)
      contextBridge.exposeInMainWorld('alwaysOnTop', alwaysOnTopAPI)
    }
    catch (error) {
      console.error(error)
    }
  }
  else {
    window.electron = electronAPI
    window.platform = platform
  }
}

export function exposeWithCustomAPI<CustomAPI>(customAPI: CustomAPI) {
  expose()

  // Use `contextBridge` APIs to expose Electron APIs to
  // renderer only if context isolation is enabled, otherwise
  // just add to the DOM global.
  if (contextIsolated) {
    try {
      contextBridge.exposeInMainWorld('api', customAPI)
    }
    catch (error) {
      console.error(error)
    }
  }
  else {
    (window as ElectronWindow<CustomAPI>).api = customAPI
  }
}
