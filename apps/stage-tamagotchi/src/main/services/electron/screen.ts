import type { createContext } from '@moeru/eventa/adapters/electron/main'
import type { BrowserWindow } from 'electron'

import { env, platform } from 'node:process'

import { defineInvokeHandler } from '@moeru/eventa'
import { cursorScreenPoint, electron, startLoopGetCursorScreenPoint } from '@proj-airi/electron-eventa'
import { createRendererLoop } from '@proj-airi/electron-vueuse/main'
import { app, Notification, screen } from 'electron'

import { desktopCapabilitiesChanged, desktopCapabilitiesGet, desktopCursorSample } from '../../../shared/eventa/desktop-companion'
import { onAppBeforeQuit, onAppWindowAllClosed } from '../../libs/bootkit/lifecycle'
import { createDesktopCursorSample, resolveDesktopCapabilities } from './desktop-capabilities'

export function createScreenService(params: { context: ReturnType<typeof createContext>['context'], window: BrowserWindow }) {
  let layoutRevision = 0
  const capabilities = () => resolveDesktopCapabilities({
    platform,
    ozonePlatform: app.commandLine.getSwitchValue('ozone-platform'),
    sessionType: env.XDG_SESSION_TYPE,
    waylandDisplay: env.WAYLAND_DISPLAY,
    xDisplay: env.DISPLAY,
    nativeNotifications: Notification.isSupported(),
    displays: screen.getAllDisplays(),
    layoutRevision,
  })
  const supportsGlobalCursor = capabilities().globalCursor === 'available'
  const assertGlobalCursor = () => {
    if (!supportsGlobalCursor)
      throw new Error('Global cursor coordinates are unavailable on this Electron backend')
  }
  const { start, stop } = createRendererLoop({
    window: params.window,
    run: async () => {
      if (!supportsGlobalCursor)
        return
      const dipPos = screen.getCursorScreenPoint()
      await params.context.emit(cursorScreenPoint, dipPos)
      await params.context.emit(desktopCursorSample, createDesktopCursorSample({
        point: dipPos,
        contentBounds: params.window.getContentBounds(),
        zoomFactor: params.window.webContents.getZoomFactor(),
        displayId: screen.getDisplayNearestPoint(dipPos).id,
        sampledAt: Date.now(),
        layoutRevision,
      }))
    },
  })

  const updateDisplays = () => {
    layoutRevision += 1
    void params.context.emit(desktopCursorSample, null).catch(() => {})
    void params.context.emit(desktopCapabilitiesChanged, capabilities()).catch(() => {})
  }
  screen.on('display-added', updateDisplays)
  screen.on('display-removed', updateDisplays)
  screen.on('display-metrics-changed', updateDisplays)
  defineInvokeHandler(params.context, desktopCapabilitiesGet, capabilities)

  // The loop stops with its window; these cover the app closing first.
  const offAllClosed = onAppWindowAllClosed(() => stop())
  const offBeforeQuit = onAppBeforeQuit(() => stop())
  params.window.once('closed', () => {
    offAllClosed()
    offBeforeQuit()
    screen.removeListener('display-added', updateDisplays)
    screen.removeListener('display-removed', updateDisplays)
    screen.removeListener('display-metrics-changed', updateDisplays)
  })
  defineInvokeHandler(params.context, startLoopGetCursorScreenPoint, () => {
    if (supportsGlobalCursor)
      start()
  })

  defineInvokeHandler(params.context, electron.screen.getAllDisplays, () => screen.getAllDisplays())
  defineInvokeHandler(params.context, electron.screen.getPrimaryDisplay, () => screen.getPrimaryDisplay())
  defineInvokeHandler(params.context, electron.screen.dipToScreenPoint, (point) => {
    assertGlobalCursor()
    return point ? screen.dipToScreenPoint(point) : screen.getCursorScreenPoint()
  })
  defineInvokeHandler(params.context, electron.screen.dipToScreenRect, (rect) => {
    assertGlobalCursor()
    return rect ? screen.dipToScreenRect(params.window, rect) : params.window.getBounds()
  })
  defineInvokeHandler(params.context, electron.screen.screenToDipPoint, (point) => {
    assertGlobalCursor()
    return point ? screen.screenToDipPoint(point) : screen.getCursorScreenPoint()
  })
  defineInvokeHandler(params.context, electron.screen.screenToDipRect, (rect) => {
    assertGlobalCursor()
    return rect ? screen.screenToDipRect(params.window, rect) : params.window.getBounds()
  })
  defineInvokeHandler(params.context, electron.screen.getCursorScreenPoint, () => {
    assertGlobalCursor()
    return screen.getCursorScreenPoint()
  })
}
