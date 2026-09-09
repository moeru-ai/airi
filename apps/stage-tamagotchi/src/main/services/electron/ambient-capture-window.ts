import type { BrowserWindow } from 'electron'

import process from 'node:process'

import { randomUUID } from 'node:crypto'
import { join } from 'node:path'

import { defineInvokeHandler } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/electron/main'
import { app, ipcMain, screen } from 'electron'

import { readAmbientCapture, startAmbientCapture, stopAmbientCapture } from '../../../shared/screen-ambient-capture'
import { AmbientCapture } from './ambient-capture'

/**
 * Gives the stage window exclusive ownership of its native capture. Reload,
 * crash, and close stop the helper. Session IDs isolate superseded requests;
 * sender checks prevent another renderer from operating this window's stream.
 */
export function setupAmbientCapture(window: BrowserWindow) {
  const { context, dispose } = createContext(ipcMain, window, { onlySameWindow: true })
  let current: { id: string, capture: AmbientCapture } | undefined
  const stop = () => {
    current?.capture.stop()
    current = undefined
  }
  const cleanup = [
    defineInvokeHandler(context, startAmbientCapture, async (options, event) => {
      if (event?.raw.ipcMainEvent.sender.id !== window.webContents.id)
        throw new Error('Screen capture belongs to another window.')
      if (process.platform !== 'darwin')
        return null
      if (!screen.getAllDisplays().some(display => display.id === options.displayId)
        || !Number.isInteger(options.width) || options.width < 1 || options.width > 512
        || !Number.isInteger(options.height) || options.height < 1 || options.height > 512
        || !Number.isInteger(options.frameRate) || options.frameRate < 1 || options.frameRate > 30) {
        throw new Error('Invalid screen capture configuration.')
      }
      stop()
      const windowId = Number(window.getMediaSourceId().split(':')[1])
      const binary = app.isPackaged
        ? join(process.resourcesPath, 'native', 'screen-capture')
        : join(app.getAppPath(), 'out', 'native', 'screen-capture')
      const session = { id: randomUUID(), capture: new AmbientCapture(binary, options, windowId) }
      current = session
      await session.capture.ready
      return session.id
    }),
    defineInvokeHandler(context, readAmbientCapture, async (id, event) => {
      if (event?.raw.ipcMainEvent.sender.id !== window.webContents.id || current?.id !== id)
        throw new Error('Screen capture session is no longer active.')
      return current.capture.read()
    }),
    defineInvokeHandler(context, stopAmbientCapture, async (id, event) => {
      if (event?.raw.ipcMainEvent.sender.id === window.webContents.id && current?.id === id)
        stop()
    }),
  ]
  window.webContents.on('did-start-navigation', (_event, _url, inPlace, isMainFrame) => {
    if (isMainFrame && !inPlace)
      stop()
  })
  window.webContents.on('render-process-gone', stop)
  window.once('closed', () => {
    stop()
    cleanup.forEach(remove => remove())
    dispose()
  })
}
