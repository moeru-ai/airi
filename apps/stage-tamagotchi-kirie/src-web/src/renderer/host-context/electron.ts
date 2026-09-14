import type { KirieEventaContext, KirieEventaContextHandle } from '@gd-kirie/ipc-eventa'

import { createContext } from '@moeru/eventa/adapters/electron/renderer'

export function createElectronHostEventaContext(): KirieEventaContextHandle {
  const ipcRenderer = window.electron?.ipcRenderer
  if (!ipcRenderer)
    throw new Error('Electron ipcRenderer is not available.')

  const owner = createContext(ipcRenderer)
  return {
    context: owner.context as unknown as KirieEventaContext,
    dispose: owner.dispose,
  }
}
