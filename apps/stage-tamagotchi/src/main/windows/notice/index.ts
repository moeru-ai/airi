import type { TouchAction, TouchEventPayload } from '@proj-airi/server-sdk-shared'
import type { BrowserWindow } from 'electron'

import type { RequestWindowPayload } from '../../../shared/eventa'
import type { I18n } from '../../libs/i18n'
import type { ServerChannel } from '../../services/airi/channel-server'

import { join, resolve } from 'node:path'

import { defineInvokeHandler } from '@moeru/eventa'
import { safeClose } from '@proj-airi/electron-vueuse/main'
import { BrowserWindow as ElectronBrowserWindow, screen, shell } from 'electron'

import icon from '../../../../resources/icon.png?asset'

import { noticeTaskTouchAction, noticeWindowEventa } from '../../../shared/eventa'
import { baseUrl, getElectronMainDirname, load, withHashRoute } from '../../libs/electron/location'
import { createReferencedWindowManager } from '../shared/referenced-window'

/**
 * How long a task-touch toast stays up without any interaction before the
 * main process closes it and records the touch as ignored. The renderer's
 * fade-on-hover keeps the toast readable while hovered, so this only needs
 * to be long enough for an unhurried glance — not a decision deadline.
 */
const TASK_TOUCH_AUTO_DISMISS_MS = 30 * 1000

export interface NoticeWindowManager {
  open: (payload: RequestWindowPayload) => Promise<boolean>
  /**
   * Presents an L2 task-touch toast and reports how the user reacted.
   *
   * Use when:
   * - The screen observer delivers an L2 touch that must be shown as a light
   *   notice (frozen seam: route `/notice/task-touch`, type `task-touch`).
   *
   * Expects:
   * - `touch.actions` already reflects the contract's per-level action set.
   *
   * Returns:
   * - The chosen action, or `undefined` when the toast was dismissed or timed
   *   out with no interaction — the caller records that as an ignore for the
   *   "ignored twice at the same level -> downgrade" rule.
   */
  openTaskTouch: (touch: TouchEventPayload) => Promise<TouchAction | undefined>
}

export function setupNoticeWindowManager(params: {
  i18n: I18n
  serverChannel: ServerChannel
}): NoticeWindowManager {
  const rendererBase = baseUrl(resolve(getElectronMainDirname(), '..', 'renderer'))

  function createWindow(_id: string): BrowserWindow {
    const window = new ElectronBrowserWindow({
      title: 'Notice',
      width: 1020,
      height: 600,
      show: false,
      icon,
      webPreferences: {
        preload: join(getElectronMainDirname(), '../preload/index.mjs'),
        sandbox: false,
      },
    })

    window.webContents.setWindowOpenHandler((details) => {
      shell.openExternal(details.url)
      return { action: 'deny' }
    })

    return window
  }

  // Task-touch toasts must not interrupt: small, frameless, bottom-right,
  // always on top, and non-focusable. `focusable: false` keeps show() from
  // activating the window, so focus never leaves what the user is doing —
  // mouse clicks on the action row still work without focus.
  function createTaskTouchWindow(_id: string): BrowserWindow {
    const { workArea } = screen.getPrimaryDisplay()
    const width = 400
    const height = 132
    const margin = 16

    const window = new ElectronBrowserWindow({
      title: 'Notice',
      width,
      height,
      x: workArea.x + workArea.width - width - margin,
      y: workArea.y + workArea.height - height - margin,
      show: false,
      frame: false,
      resizable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      focusable: false,
      icon,
      webPreferences: {
        preload: join(getElectronMainDirname(), '../preload/index.mjs'),
        sandbox: false,
      },
    })

    window.webContents.setWindowOpenHandler((details) => {
      shell.openExternal(details.url)
      return { action: 'deny' }
    })

    return window
  }

  async function loadNoticeRoute(window: BrowserWindow, payload: RequestWindowPayload & { id: string }) {
    const routeWithId = `${payload.route}?id=${payload.id}`
    await load(window, withHashRoute(rendererBase, routeWithId))
  }

  const manager = createReferencedWindowManager({
    eventa: noticeWindowEventa,
    i18n: params.i18n,
    serverChannel: params.serverChannel,
    createWindow,
    loadRoute: loadNoticeRoute,
  })

  const taskTouchManager = createReferencedWindowManager({
    eventa: noticeWindowEventa,
    i18n: params.i18n,
    serverChannel: params.serverChannel,
    createWindow: createTaskTouchWindow,
    loadRoute: loadNoticeRoute,
  })

  return {
    open: async (payload: RequestWindowPayload) => {
      const handle = await manager.open(payload)
      return await new Promise<boolean>((resolve) => {
        defineInvokeHandler(handle.context, noticeWindowEventa.windowAction, (action) => {
          if (!action?.id || action.id !== handle.id)
            return
          resolve(action.action === 'confirm')
          safeClose(handle.window)
        })
      })
    },
    openTaskTouch: async (touch: TouchEventPayload) => {
      const handle = await taskTouchManager.open({
        route: '/notice/task-touch',
        type: 'task-touch',
        payload: touch,
      })

      return await new Promise<TouchAction | undefined>((resolveAction) => {
        // The page closes itself after sending an action; closing with no
        // action (user dismissal or the timeout below) resolves as ignored.
        const dismissTimer = setTimeout(safeClose, TASK_TOUCH_AUTO_DISMISS_MS, handle.window)

        let settled = false
        const settle = (action: TouchAction | undefined) => {
          if (settled)
            return
          settled = true
          clearTimeout(dismissTimer)
          resolveAction(action)
        }

        handle.window.on('closed', () => settle(undefined))

        defineInvokeHandler(handle.context, noticeTaskTouchAction, (request) => {
          if (!request?.id || request.id !== handle.id)
            return
          settle(request.action)
        })
      })
    },
  }
}
