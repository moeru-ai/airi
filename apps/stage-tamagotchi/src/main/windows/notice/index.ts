import type { BrowserWindow } from 'electron'

import type { RequestWindowPayload } from '../../../shared/eventa'

import { join, resolve } from 'node:path'

import { defineInvokeHandler } from '@moeru/eventa'
import { BrowserWindow as ElectronBrowserWindow, shell } from 'electron'

import icon from '../../../../resources/icon.png?asset'

import { noticeWindowEventa } from '../../../shared/eventa'
import { baseUrl, getElectronMainDirname, load, withHashRoute } from '../../libs/electron/location'
import { createReferencedWindowManager } from '../shared/referenced-window'

export interface NoticeWindowManager {
  open: (payload: RequestWindowPayload) => Promise<boolean>
}

export function setupNoticeWindowManager(): NoticeWindowManager {
  const rendererBase = baseUrl(resolve(getElectronMainDirname(), '..', 'renderer'))

  function createWindow(_id: string): BrowserWindow {
    const window = new ElectronBrowserWindow({
      title: 'Notice',
      width: 1020,
      height: 600,
      show: false,
      icon,
      webPreferences: {
        preload: join(__dirname, '../preload/index.mjs'),
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
    createWindow,
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
          if (!handle.window.isDestroyed())
            handle.window.close()
        })
      })
    },
  }
}
