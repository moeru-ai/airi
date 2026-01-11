import type { BrowserWindow } from 'electron'

import { attemptAsync } from 'es-toolkit'

import { useLoop } from '../event-loop'

const rendererDisposedMessage = 'Render frame was disposed before WebFrameMain could be accessed'

export function isRendererUnavailable(window: BrowserWindow) {
  return window.isDestroyed() || window.webContents.isDestroyed() || window.webContents.isCrashed()
}

export function shouldStopForRendererError(error: unknown) {
  if (!(error instanceof Error) || !error.message) {
    return false
  }

  return error.message.includes(rendererDisposedMessage)
}

export function stopLoopWhenRendererIsGone(window: BrowserWindow, stop: () => void) {
  window.on('closed', stop)
  window.webContents.on('destroyed', stop)
  window.webContents.on('render-process-gone', stop)
}

function ensureRendererIsAvailable(window: BrowserWindow, stop: () => void) {
  if (isRendererUnavailable(window)) {
    stop()
    return false
  }

  return true
}

export function createRendererLoop(params: { window: BrowserWindow, run: () => Promise<void> | void, interval?: number, autoStart?: boolean }) {
  const { start, stop } = useLoop(async () => {
    if (!ensureRendererIsAvailable(params.window, stop)) {
      return
    }

    const [error] = await attemptAsync(async () => {
      await params.run()
    })

    if (!error) {
      return
    }

    if (shouldStopForRendererError(error)) {
      stop()
      return
    }

    throw error
  }, {
    autoStart: params.autoStart ?? false,
    interval: params.interval,
  })

  stopLoopWhenRendererIsGone(params.window, stop)

  const startLoop = () => {
    if (!ensureRendererIsAvailable(params.window, stop)) {
      return
    }

    start()
  }

  return {
    start: startLoop,
    stop,
  }
}
