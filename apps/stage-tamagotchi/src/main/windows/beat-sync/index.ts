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

  // NOTICE:
  // BeatSync is a background helper window and must not block desktop app boot.
  // In local development we have seen `load(...)` for the hidden BeatSync page hang
  // long enough to prevent `windows:main` from ever being created, leaving the app
  // process alive with zero visible windows.
  // We therefore start loading the page in the background and only log failures here,
  // so the main AIRI window can still open while BeatSync initializes independently.
  void load(window, baseUrl(resolve(getElectronMainDirname(), '..', 'renderer'), 'beat-sync.html')).catch((error) => {
    console.error('[beat-sync] failed to load background window:', error)
  })

  initScreenCaptureForWindow(window)

  return window
}
