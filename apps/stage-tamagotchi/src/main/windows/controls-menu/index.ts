import type { Rectangle } from 'electron'

import type { ControlsMenuRequest } from '../../../shared/eventa'
import type { I18n } from '../../libs/i18n'
import type { ServerChannel } from '../../services/airi/channel-server'
import type { NoticeWindowManager } from '../notice'
import type { SettingsWindowManager } from '../settings'

import { defineInvoke } from '@moeru/eventa'
import { onWindowClosed } from '@proj-airi/electron-vueuse/main'
import { BrowserWindow, screen } from 'electron'
import { isMacOS } from 'std-env'

import icon from '../../../../resources/icon.png?asset'

import { electronControlsMenuShow } from '../../../shared/eventa'
import { focusWindow } from '../../libs/electron/focus'
import { baseUrl, getPreloadPath, getRendererRoot, load, withHashRoute } from '../../libs/electron/location'
import { createWindowContext } from '../../libs/electron/window-context'
import { createReusableWindow } from '../../libs/electron/window-manager/reusable'
import { protectPrivilegedWindowNavigation, setWindowAlwaysOnTop, transparentWindowConfig } from '../shared/window'
import { placeControlsMenu } from './placement'
import { setupControlsMenuWindowInvokes } from './rpc/index.electron'

/** The app menu of the controls island, in a window of its own. */
export interface ControlsMenuWindowManager {
  /**
   * Shows the menu beside the more button. `request.anchor` is in the page coordinates of the main window.
   * Resolves when the window shows.
   */
  open: (request: ControlsMenuRequest) => Promise<void>
  /** Loads the menu page without showing it. */
  prepare: () => Promise<void>
  /** Calls `listener` each time the menu closes. Returns the function that stops it. */
  onClosed: (listener: () => void) => () => void
  /** Calls `listener` each time the menu asks for Hearing controls. Returns the function that stops it. */
  onOpenHearing: (listener: () => void) => () => void
  /**
   * Calls `listener` each time a read of Notifications in the menu reached the server or rolled back. Returns the
   * function that stops it.
   */
  onNotificationsRead: (listener: () => void) => () => void
}

/** The menu page of one window. A new window, after a crash for example, gets a new page. */
interface MenuPage {
  /** Resolves when the page can take requests. Rejects when the window closes first. */
  mounted: PromiseWithResolvers<void>
  show: (request: ControlsMenuRequest) => Promise<void>
}

/**
 * Creates the window of the app menu, so the menu and its submenus can extend past the main window.
 *
 * The window is transparent and covers the work area of the display under the more button. While the menu shows, the
 * window takes every click, so a click beside the menu closes it, as a native menu does. The page closes the menu on
 * Escape, on a selection, on an outside click, and when the window loses focus. After the exit animation, the page asks
 * the window to hide.
 *
 * The window loads once and stays loaded while hidden. So the menu opens without a page load, and the menu can start a
 * sign-in that another surface asks for.
 */
export function setupControlsMenuWindowManager(params: {
  mainWindow: BrowserWindow
  serverChannel: ServerChannel
  i18n: I18n
  settingsWindow: SettingsWindowManager
  noticeWindow: NoticeWindowManager
  /** Centers the main window, for the item of the menu that does it. */
  centerMainWindow: () => Rectangle
}): ControlsMenuWindowManager {
  const closedListeners = new Set<() => void>()
  const hearingListeners = new Set<() => void>()
  const readListeners = new Set<() => void>()
  let page: MenuPage | undefined
  /** Only a shown menu reports a close. A window that closes while it is hidden reports nothing. */
  let shown = false

  function reportClosed() {
    if (!shown)
      return
    shown = false
    for (const listener of closedListeners)
      listener()
  }

  const menuWindow = createReusableWindow(async () => {
    const window = new BrowserWindow({
      ...transparentWindowConfig(),
      title: 'Controls Menu',
      show: false,
      resizable: false,
      maximizable: false,
      minimizable: false,
      fullscreenable: false,
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
    // The main window shows on every workspace, so its menu opens on the workspace in front.
    window.setVisibleOnAllWorkspaces(true)
    // The main window stays on top at relative level 1. The menu opens above it.
    setWindowAlwaysOnTop(window, true, 2)
    protectPrivilegedWindowNavigation(window)

    const { context } = createWindowContext(window)
    const windowPage: MenuPage = {
      mounted: Promise.withResolvers<void>(),
      show: defineInvoke(context, electronControlsMenuShow),
    }
    // A window can close before any request waits for its page, and then nothing handles the rejection.
    windowPage.mounted.promise.catch(() => {})
    page = windowPage
    onWindowClosed(window, () => {
      if (page === windowPage)
        page = undefined
      // A request that waits for this page fails, so the more button of the island stops showing an open menu.
      windowPage.mounted.reject(new Error('The menu window closed before its page mounted'))
      reportClosed()
    })

    // The guards below do not depend on the page. A page that stopped or failed cannot close the menu, and the window
    // would stay above every app and take every click in the work area.

    // A page that stopped closes with its window. The next request creates a new window.
    window.webContents.on('render-process-gone', () => {
      if (!window.isDestroyed())
        window.close()
    })
    // A page that did not load never mounts, so the window closes, and the request that waits for the page fails.
    window.webContents.on('did-fail-load', (_event, errorCode, _description, _url, isMainFrame) => {
      // ERR_ABORTED (-3) is a false alarm of hash routes. See `load` in `libs/electron/location.ts`.
      if (!isMainFrame || errorCode === -3 || window.isDestroyed())
        return
      window.close()
    })
    // The page makes the window click-through when the menu closes. When the window loses focus, it stops taking clicks
    // here too, so a page that cannot answer does not hold the screen. The page takes the clicks back on the next open.
    window.on('blur', () => {
      if (!window.isDestroyed())
        window.setIgnoreMouseEvents(true)
    })

    await setupControlsMenuWindowInvokes({
      context,
      window,
      serverChannel: params.serverChannel,
      i18n: params.i18n,
      settingsWindow: params.settingsWindow,
      noticeWindow: params.noticeWindow,
      centerMainWindow: params.centerMainWindow,
      onPageMounted: () => windowPage.mounted.resolve(),
      hide,
      openHearing: () => {
        for (const listener of hearingListeners)
          listener()
      },
      notificationsRead: () => {
        for (const listener of readListeners)
          listener()
      },
    })

    await load(window, withHashRoute(baseUrl(getRendererRoot()), '/controls-menu', {
      query: { 'stage-runtime': 'minimal', 'synced-leader': 'false' },
    }))

    return window
  })

  onWindowClosed(params.mainWindow, () => menuWindow.close())

  function hide() {
    const window = menuWindow.getOpenWindow()
    if (window?.isVisible())
      window.hide()
    reportClosed()
  }

  async function open(request: ControlsMenuRequest) {
    // Each failure throws, so the island that asked stops showing an open menu.
    const window = await menuWindow.getWindow()
    const windowPage = page
    // The window closed during its setup, for example because its page did not load.
    if (!windowPage)
      throw new Error('The menu window closed before its page mounted')
    await windowPage.mounted.promise
    if (window.isDestroyed() || params.mainWindow.isDestroyed())
      throw new Error('A window closed before the menu opened')

    const placement = placeControlsMenu({
      content: params.mainWindow.getContentBounds(),
      anchor: request.anchor,
      workAreaOf: rectangle => screen.getDisplayMatching(rectangle).workArea,
    })
    window.setBounds(placement.bounds)

    await windowPage.show({ ...request, anchor: placement.anchor })
    shown = true
    focusWindow(window)
  }

  return {
    open,
    prepare: async () => {
      await menuWindow.getWindow()
    },
    onClosed: (listener) => {
      closedListeners.add(listener)
      return () => closedListeners.delete(listener)
    },
    onOpenHearing: (listener) => {
      hearingListeners.add(listener)
      return () => hearingListeners.delete(listener)
    },
    onNotificationsRead: (listener) => {
      readListeners.add(listener)
      return () => readListeners.delete(listener)
    },
  }
}
