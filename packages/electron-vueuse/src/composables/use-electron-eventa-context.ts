import type { InvokeEventa } from '@moeru/eventa'
import type { ShallowRef } from 'vue'

import { defineInvoke } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/electron/renderer'
import { shallowRef } from 'vue'

type EventaContext = ReturnType<typeof createContext>['context']
type IpcRendererLike = Parameters<typeof createContext>[0]

let sharedContext: EventaContext | undefined

function resolveIpcRenderer(ipcRenderer?: IpcRendererLike): IpcRendererLike {
  if (ipcRenderer) {
    return ipcRenderer
  }

  const globalIpcRenderer = (globalThis as { window?: { electron?: { ipcRenderer?: IpcRendererLike } } }).window?.electron?.ipcRenderer
  if (!globalIpcRenderer) {
    throw new Error('Electron ipcRenderer is not available. Pass it explicitly to useElectronEventaContext().')
  }

  return globalIpcRenderer
}

export function getElectronEventaContext(ipcRenderer?: IpcRendererLike): EventaContext {
  sharedContext ??= createContext(resolveIpcRenderer(ipcRenderer)).context
  return sharedContext
}

export function useElectronEventaContext(ipcRenderer?: IpcRendererLike): ShallowRef<EventaContext> {
  return shallowRef(getElectronEventaContext(ipcRenderer))
}

export function useElectronEventaInvoke<Res, Req = undefined, ResErr = Error, ReqErr = Error>(invoke: InvokeEventa<Res, Req, ResErr, ReqErr>, context?: EventaContext) {
  return defineInvoke(context ?? getElectronEventaContext(), invoke)
}

export function resetElectronEventaContextForTesting() {
  sharedContext = undefined
}
