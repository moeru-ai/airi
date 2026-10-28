import type { WebContents } from 'electron'

import type { IOTraceHub } from '.'

import { defineInvokeHandler } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/electron/main'
import { BrowserWindow, ipcMain } from 'electron'

import {
  ioTraceHubGet,
  ioTraceHubPublish,
  ioTraceHubSetCollecting,
  ioTraceHubSpan,
  ioTraceHubSubscribe,
  ioTraceHubUnsubscribe,
} from '../../../../shared/eventa'

/**
 * Connects the IO trace hub to every renderer window.
 *
 * The handlers use one context without a window, so each invoke runs once, whichever window sends it. A window
 * context would also receive the invokes of the other windows on the shared `ipcMain`.
 * A subscribed window gets its own window context only to receive pushed spans.
 */
export function registerIOTraceHub(hub: IOTraceHub): () => void {
  const { context, dispose } = createContext(ipcMain)
  const viewers = new Map<number, () => void>()

  function stopViewer(webContentsId: number): void {
    viewers.get(webContentsId)?.()
    viewers.delete(webContentsId)
  }

  function startViewer(sender: WebContents) {
    stopViewer(sender.id)

    const window = BrowserWindow.fromWebContents(sender)
    if (!window)
      return []

    const viewer = createContext(ipcMain, window)
    const subscription = hub.subscribe((span) => {
      if (!window.isDestroyed())
        void viewer.context.emit(ioTraceHubSpan, span)
    })
    const onDestroyed = () => stopViewer(sender.id)
    const stop = () => {
      subscription.unsubscribe()
      viewer.dispose()
      sender.off('destroyed', onDestroyed)
    }
    sender.once('destroyed', onDestroyed)
    viewers.set(sender.id, stop)
    return subscription.spans
  }

  const disposers = [
    defineInvokeHandler(context, ioTraceHubPublish, span => hub.publish(span)),
    defineInvokeHandler(context, ioTraceHubGet, () => hub.getState()),
    defineInvokeHandler(context, ioTraceHubSetCollecting, ({ collecting }) => hub.setCollecting(collecting)),
    defineInvokeHandler(context, ioTraceHubSubscribe, (_, options) => {
      const sender = options?.raw.ipcMainEvent.sender
      return sender ? startViewer(sender) : []
    }),
    defineInvokeHandler(context, ioTraceHubUnsubscribe, (_, options) => {
      const sender = options?.raw.ipcMainEvent.sender
      if (sender)
        stopViewer(sender.id)
    }),
  ]

  return () => {
    disposers.forEach(stop => stop())
    for (const id of [...viewers.keys()])
      stopViewer(id)
    dispose()
  }
}
