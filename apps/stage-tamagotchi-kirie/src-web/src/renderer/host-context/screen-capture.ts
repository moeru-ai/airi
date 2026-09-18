import type { SourcesOptions } from 'electron'
import type { MaybeRefOrGetter } from 'vue'

import { useElectronScreenCapture } from '@proj-airi/electron-screen-capture/vue'

import { initializeHostContext } from './owner'

/**
 * Exposes Electron screen capture only when the active host provides its
 * preload API. Kirie callers can render an unsupported state without failing
 * during component setup.
 */
export function useHostScreenCapture(sourcesOptions: MaybeRefOrGetter<SourcesOptions>) {
  if (initializeHostContext().runtime === 'electron') {
    return {
      ...useElectronScreenCapture(window.electron.ipcRenderer, sourcesOptions),
      isSupported: true,
    }
  }

  const unavailable = () => {
    throw new Error('Screen capture is not available in the Kirie host.')
  }

  return {
    isSupported: false,
    getSources: async () => [],
    setSource: async () => unavailable(),
    resetSource: async () => {},
    selectWithSource: async <R>(): Promise<R> => unavailable(),
    checkMacOSPermission: async () => 'denied' as const,
    requestMacOSPermission: async () => {},
  }
}
