import type { I18n } from '../../libs/i18n'
import type { ServerChannel } from '../../services/airi/channel-server'
import type { GlobalShortcutService } from '../../services/electron/global-shortcut'

import { BrowserWindow, screen } from 'electron'
import { isMacOS } from 'std-env'

import icon from '../../../../resources/icon.png?asset'

import { baseUrl, getPreloadPath, getRendererRoot, load, withHashRoute } from '../../libs/electron/location'
import { createReusableWindow } from '../../libs/electron/window-manager/reusable'
import { protectPrivilegedWindowNavigation, setWindowAlwaysOnTop, transparentWindowConfig } from '../shared/window'
import { INLAY_WINDOW_HEIGHT, inlayWindowBounds } from './bounds'
import { setupInlayWindowInvokes } from './rpc/index.electron'

/**
 * Creates the voice inlay window: a transparent, click-through overlay near the bottom center of the screen.
 *
 * The main window shows it once at startup and it stays shown, so speech appears without window creation or
 * page load latency. The page paints only a capsule or a card. Everything else is transparent, and the page makes
 * only its painted area take the pointer, so the window never blocks the apps below.
 * The window floats above other windows on every workspace, because speech can start while another app is in front.
 * Its home is the bottom center of the primary display. The user can drag the capsule or the card elsewhere.
 * The page asks the window to return home after it has painted nothing for a while, so the next capsule appears
 * where the user expects it. The window also returns home when the displays change.
 */
export function setupInlayWindowReusable(params: {
  serverChannel: ServerChannel
  i18n: I18n
  globalShortcut: GlobalShortcutService
}) {
  return createReusableWindow(async () => {
    const window = new BrowserWindow({
      ...transparentWindowConfig(),
      title: 'Inlay',
      width: 450,
      height: INLAY_WINDOW_HEIGHT,
      show: false,
      resizable: false,
      maximizable: false,
      minimizable: false,
      skipTaskbar: true,
      icon,
      webPreferences: {
        preload: getPreloadPath(),
        sandbox: false,
      },
    })

    if (isMacOS) {
      window.setWindowButtonVisibility(false)
      window.setHiddenInMissionControl(true)
    }
    window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    setWindowAlwaysOnTop(window, true)
    // The page takes the pointer back over what it paints. `forward` keeps mouse moves reaching the page for that hit test.
    window.setIgnoreMouseEvents(true, { forward: true })

    const place = () => {
      if (!window.isDestroyed())
        window.setBounds(inlayWindowBounds(screen.getPrimaryDisplay().workArea))
    }
    place()
    // A resolution change, a moved Dock, or another primary display moves the work area under the fixed window.
    screen.on('display-metrics-changed', place)
    screen.on('display-added', place)
    screen.on('display-removed', place)
    window.once('closed', () => {
      screen.off('display-metrics-changed', place)
      screen.off('display-added', place)
      screen.off('display-removed', place)
    })

    protectPrivilegedWindowNavigation(window)

    await setupInlayWindowInvokes({ inlayWindow: window, serverChannel: params.serverChannel, i18n: params.i18n, globalShortcut: params.globalShortcut, returnHome: place })

    await load(window, withHashRoute(baseUrl(getRendererRoot()), '/inlay', {
      query: { 'stage-runtime': 'minimal', 'synced-leader': 'false' },
    }))

    return window
  }).getWindow
}
