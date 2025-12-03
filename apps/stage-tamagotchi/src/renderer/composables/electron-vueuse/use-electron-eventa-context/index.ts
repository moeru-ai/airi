import type { InvokeEventa } from '@moeru/eventa'

import { defineInvoke } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/electron/renderer'
import { ref } from 'vue'

export function useElectronEventaContext() {
  const context = ref(createContext(window.electron.ipcRenderer).context)

  return context
}

export function useElectronEventaInvoke<Res, Req = undefined, ResErr = Error, ReqErr = Error>(invoke: InvokeEventa<Res, Req, ResErr, ReqErr>, context?: ReturnType<typeof createContext>['context']) {
  return defineInvoke(context ?? useElectronEventaContext().value, invoke)
}
