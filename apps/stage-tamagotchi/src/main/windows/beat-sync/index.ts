import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { defineInvoke, defineInvokeHandler } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/electron/main'
import {
  beatSyncBeatSignaledInvokeEventa,
  beatSyncGetInputByteFrequencyDataInvokeEventa,
  beatSyncGetStateInvokeEventa,
  beatSyncStateChangedInvokeEventa,
  beatSyncToggleInvokeEventa,
  beatSyncUpdateParametersInvokeEventa,
} from '@proj-airi/stage-shared/beat-sync'
import { BrowserWindow, ipcMain } from 'electron'

import {
  beatSyncElectronChangeState,
  beatSyncElectronGetInputByteFrequencyData,
  beatSyncElectronGetState,
  beatSyncElectronSignalBeat,
  beatSyncElectronToggle,
  beatSyncElectronUpdateParameters,
} from '../../../shared/eventa'
import { baseUrl, getElectronMainDirname, load } from '../../libs/electron/location'

export async function setupBeatSync() {
  const window = new BrowserWindow({
    show: false,
    webPreferences: {
      preload: join(dirname(fileURLToPath(import.meta.url)), '../preload/beat-sync.mjs'),
      sandbox: false,
    },
  })
  const context = createContext(ipcMain, window).context

  // TODO(Makito): Bypass here with the broadcast channel-based transport when it is released.
  // [main] -> [renderer] beat-sync
  const toggle = defineInvoke(context, beatSyncElectronToggle) as (enabled: boolean) => Promise<void> // TODO: Better type
  const getState = defineInvoke(context, beatSyncElectronGetState)
  const updateParameters = defineInvoke(context, beatSyncElectronUpdateParameters)
  const getInputByteFrequencyData = defineInvoke(context, beatSyncElectronGetInputByteFrequencyData)

  await load(window, baseUrl(resolve(getElectronMainDirname(), '..', 'renderer'), 'beat-sync.html'))
  return {
    window,
    dispatchTo: (window: BrowserWindow) => {
      const context = createContext(ipcMain, window).context

      const stateChanged = defineInvoke(context, beatSyncStateChangedInvokeEventa)
      const beatSignaled = defineInvoke(context, beatSyncBeatSignaledInvokeEventa)
      const removeHandlerFns = [
        // [renderer] beat-sync -> [main] -> [renderer] index (Events)
        defineInvokeHandler(context, beatSyncElectronChangeState, async e => stateChanged(e)),
        defineInvokeHandler(context, beatSyncElectronSignalBeat, async e => beatSignaled(e)),

        // [renderer] index -> [main] -> [renderer] beat-sync (Functions)
        defineInvokeHandler(context, beatSyncToggleInvokeEventa, async enabled => toggle(enabled)),
        defineInvokeHandler(context, beatSyncGetStateInvokeEventa, async () => getState()),
        defineInvokeHandler(context, beatSyncUpdateParametersInvokeEventa, async params => updateParameters(params)),
        defineInvokeHandler(context, beatSyncGetInputByteFrequencyDataInvokeEventa, async () => getInputByteFrequencyData()),
      ]
      const removeHandlers = () => removeHandlerFns.forEach(fn => fn())
      window.on('closed', () => removeHandlers())
      return removeHandlers
    },
  }
}
