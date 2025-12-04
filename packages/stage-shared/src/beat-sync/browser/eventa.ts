import { createContext as createWebContext } from '@moeru/eventa'
import { createContext as createElectronRendererContext } from '@moeru/eventa/adapters/electron/renderer'
import { isElectronWindow } from '@proj-airi/stage-shared'

export function createContext() {
  if (isElectronWindow(window)) {
    return createElectronRendererContext(window.electron.ipcRenderer).context
  }
  else {
    return createWebContext()
  }
}
