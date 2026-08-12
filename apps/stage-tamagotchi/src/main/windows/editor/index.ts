import type { BrowserWindow } from 'electron'

import type { I18n } from '../../libs/i18n'
import type { ServerChannel } from '../../services/airi/channel-server'

import { join, resolve } from 'node:path'

import { BrowserWindow as ElectronBrowserWindow } from 'electron'

import icon from '../../../../resources/icon.png?asset'

import { baseUrl, getElectronMainDirname, load, withHashRoute } from '../../libs/electron/location'
import { createReusableWindow } from '../../libs/electron/window-manager'
import { protectPrivilegedWindowNavigation, toggleWindowShow } from '../shared'
import { setupEditorWindowInvokes } from './rpc/index.electron'

export interface EditorWindowManager {
  /** Returns the live editor window, creating it when necessary. */
  getWindow: () => Promise<BrowserWindow>
  /** Opens and focuses the reusable editor window. */
  openWindow: () => Promise<void>
}

/**
 * Creates the reusable window boundary for the Tamagotchi editor.
 *
 * The renderer starts at an empty Tamagotchi-owned route so the editor can
 * evolve independently from the current settings window and shared pages.
 */
export function setupEditorWindowManager(params: {
  i18n: I18n
  serverChannel: ServerChannel
}): EditorWindowManager {
  const rendererBase = baseUrl(resolve(getElectronMainDirname(), '..', 'renderer'))
  const reusable = createReusableWindow(async () => {
    const window = new ElectronBrowserWindow({
      title: 'AIRI Editor',
      width: 1200,
      height: 800,
      minWidth: 800,
      minHeight: 600,
      show: false,
      icon,
      webPreferences: {
        preload: join(getElectronMainDirname(), '../preload/index.mjs'),
        sandbox: false,
      },
    })

    window.on('ready-to-show', () => window.show())
    protectPrivilegedWindowNavigation(window)

    await setupEditorWindowInvokes({
      window,
      i18n: params.i18n,
      serverChannel: params.serverChannel,
    })
    await load(window, withHashRoute(rendererBase, '/editor'))

    return window
  })

  async function openWindow() {
    toggleWindowShow(await reusable.getWindow())
  }

  return {
    getWindow: reusable.getWindow,
    openWindow,
  }
}
