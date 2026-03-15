import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { initScreenCaptureForWindow } from '@proj-airi/electron-screen-capture/main'
import { BrowserWindow } from 'electron'

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

  initScreenCaptureForWindow(window)

  return window
}
