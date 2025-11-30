import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { defineInvoke, defineInvokeHandler } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/electron/main'
import { beatSyncRequestSignalBeat, beatSyncSignalBeat } from '@proj-airi/stage-shared/beat-sync/eventa'
import { BrowserWindow, ipcMain } from 'electron'

import { baseUrl, getElectronMainDirname, load } from '../../libs/electron/location'

export async function setupBeatSync() {
  const window = new BrowserWindow({
    show: false,
    webPreferences: {
      preload: join(dirname(fileURLToPath(import.meta.url)), '../preload/beat-sync.mjs'),
      sandbox: false,
    },
  })

  await load(window, baseUrl(resolve(getElectronMainDirname(), '..', 'renderer'), 'beat-sync.html'))
  return {
    window,
    dispatchTo: (window: BrowserWindow) => {
      const context = createContext(ipcMain, window).context
      const signalBeat = defineInvoke(context, beatSyncSignalBeat)
      const removeHandler = defineInvokeHandler(context, beatSyncRequestSignalBeat, async e => signalBeat(e))
      window.on('closed', () => removeHandler())
      return removeHandler
    },
  }
}
