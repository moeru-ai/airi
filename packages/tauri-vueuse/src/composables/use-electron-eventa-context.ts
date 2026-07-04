import type { InvokeEventa } from '@moeru/eventa'
import type { createContextFromTauriIpc, TauriInternals } from '@proj-airi/tauri-eventa'

import { defineInvoke } from '@moeru/eventa'
import { createContextFromTauriIpc as createTauriContext } from '@proj-airi/tauri-eventa'
import { shallowRef } from 'vue'

type EventaContext = ReturnType<typeof createContextFromTauriIpc>['context']

let sharedContext: EventaContext | undefined

function resolveTauriInternals(internals?: TauriInternals): TauriInternals {
  if (internals) return internals

  const globalInternals = (globalThis as { window?: { __TAURI_INTERNALS__?: TauriInternals } }).window
    ?.__TAURI_INTERNALS__
  if (!globalInternals) {
    throw new Error('Tauri IPC is not available. Pass it explicitly to useElectronEventaContext().')
  }

  return globalInternals
}

export function getElectronEventaContext(internals?: TauriInternals): EventaContext {
  sharedContext ??= createTauriContext(resolveTauriInternals(internals)).context
  return sharedContext
}

export function useElectronEventaContext(internals?: TauriInternals) {
  return shallowRef(getElectronEventaContext(internals))
}

export function useElectronEventaInvoke<Res, Req = undefined, ResErr = Error, ReqErr = Error>(
  invoke: InvokeEventa<Res, Req, ResErr, ReqErr>,
  context?: EventaContext,
) {
  return defineInvoke(context ?? getElectronEventaContext(), invoke)
}

export function resetElectronEventaContextForTesting() {
  sharedContext = undefined
}
