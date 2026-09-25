import type { BrowserWindow } from 'electron'

import { attemptAsync } from 'es-toolkit'

import { useLoop } from './loop'

const rendererDisposedMessage = 'Render frame was disposed before WebFrameMain could be accessed'

export function safeClose(window?: BrowserWindow | null): boolean {
  if (!window) {
    return false
  }
  if (isRendererUnavailable(window)) {
    return false
  }

  window.close()
  return true
}

export function isRendererUnavailable(window: BrowserWindow) {
  return window.isDestroyed() || window?.webContents?.isDestroyed() || window?.webContents?.isCrashed()
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

  // A hidden window paints nothing, so its renderer has no use for what the
  // loop sends. The loop pauses while the window is hidden and resumes when
  // the window shows again, if the renderer started it.
  let started = false

  const startLoop = () => {
    started = true
    if (!ensureRendererIsAvailable(params.window, stop)) {
      return
    }

    if (params.window.isVisible()) {
      start()
    }
  }

  const stopLoop = () => {
    started = false
    stop()
  }

  params.window.on('hide', stop)
  params.window.on('show', () => {
    if (started) {
      startLoop()
    }
  })

  return {
    start: startLoop,
    stop: stopLoop,
  }
}
