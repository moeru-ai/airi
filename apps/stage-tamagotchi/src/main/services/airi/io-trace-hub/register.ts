import type { TraceFeedMessage } from '@proj-airi/trace-kit'
import type { WebContents } from 'electron'

import type { IOTraceHub } from '.'

import { defineInvokeHandler } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/electron/main'
import { BrowserWindow, ipcMain, powerMonitor } from 'electron'

import {
  ioTraceHubEmit,
  ioTraceHubFeed,
  ioTraceHubGet,
  ioTraceHubPing,
  ioTraceHubResync,
  ioTraceHubSetCollecting,
  ioTraceHubSetTracks,
  ioTraceHubSubscribe,
  ioTraceHubUnsubscribe,
  ioTraceHubWanted,
} from '../../../../shared/eventa'

/** Live feed messages for one window are sent in batches. A batch waits at most this long. */
const FEED_BATCH_MS = 16

interface ConnectedWindow {
  /** The context that pushes events to this window only. */
  events: ReturnType<typeof createContext>['context']
  /** Trace sources that this window sent. A reload keeps the source and starts a new epoch. */
  sources: Set<string>
  viewer?: { unsubscribe: () => void, setTracks: (tracks: string[] | '*') => void }
  dispose: () => void
}

/**
 * Connects the trace hub to every renderer window.
 *
 * The invoke handlers use one context without a window, so each invoke runs once, whichever window sends it. A window
 * context would also receive the invokes of the other windows on the shared `ipcMain`.
 * Each window that sends records or subscribes gets its own window context to receive pushed events: feed batches,
 * wanted tracks, and resync requests.
 *
 * A window that closes or crashes reports its sources as lost to the hub.
 */
export function registerIOTraceHub(hub: IOTraceHub): () => void {
  const { context, dispose } = createContext(ipcMain)
  const windows = new Map<number, ConnectedWindow>()

  function connect(sender: WebContents): ConnectedWindow | undefined {
    const existing = windows.get(sender.id)
    if (existing)
      return existing
    const window = BrowserWindow.fromWebContents(sender)
    if (!window)
      return undefined

    const windowContext = createContext(ipcMain, window)
    const onDestroyed = () => disconnect(sender.id)
    sender.once('destroyed', onDestroyed)
    const connected: ConnectedWindow = {
      events: windowContext.context,
      sources: new Set(),
      dispose: () => {
        connected.viewer?.unsubscribe()
        windowContext.dispose()
        sender.off('destroyed', onDestroyed)
      },
    }
    windows.set(sender.id, connected)
    return connected
  }

  function disconnect(webContentsId: number): void {
    const connected = windows.get(webContentsId)
    if (!connected)
      return
    windows.delete(webContentsId)
    connected.dispose()
    for (const source of connected.sources)
      hub.closeSource(source)
  }

  function emitTo(emit: () => void): void {
    try {
      emit()
    }
    catch {
      // The window closed between the check and the send. Its `destroyed` handler disconnects it.
    }
  }

  function startViewer(sender: WebContents, tracks: string[] | '*'): TraceFeedMessage[] {
    const connected = connect(sender)
    if (!connected)
      return []
    connected.viewer?.unsubscribe()

    // The collector sends the backlog during `subscribe`. Collect it for the invoke result, then batch live messages.
    const backlog: TraceFeedMessage[] = []
    let live = false
    let batch: TraceFeedMessage[] = []
    let timer: ReturnType<typeof setTimeout> | undefined
    const flush = () => {
      timer = undefined
      const messages = batch
      batch = []
      if (messages.length > 0 && !sender.isDestroyed())
        emitTo(() => void connected.events.emit(ioTraceHubFeed, messages))
    }

    const subscription = hub.subscribe((message) => {
      if (!live) {
        backlog.push(message)
        return
      }
      batch.push(message)
      timer ??= setTimeout(flush, FEED_BATCH_MS)
    }, tracks)
    live = true
    connected.viewer = {
      unsubscribe: () => {
        if (timer)
          clearTimeout(timer)
        subscription.unsubscribe()
      },
      setTracks: subscription.setTracks,
    }
    return backlog
  }

  const stopWanted = hub.onWantedChange((tracks) => {
    for (const connected of windows.values())
      emitTo(() => void connected.events.emit(ioTraceHubWanted, { tracks }))
  })

  const onResume = () => {
    hub.markResume()
    for (const connected of windows.values())
      emitTo(() => void connected.events.emit(ioTraceHubResync, undefined))
  }
  powerMonitor.on('resume', onResume)

  const disposers = [
    defineInvokeHandler(context, ioTraceHubEmit, (payload, options) => {
      const sender = options?.raw.ipcMainEvent.sender
      const sources = hub.ingest(payload?.records ?? [])
      const connected = sender ? connect(sender) : undefined
      for (const source of sources) {
        if (connected && !connected.sources.has(source)) {
          connected.sources.add(source)
          // A new window learns the tracks that viewers already show.
          emitTo(() => void connected.events.emit(ioTraceHubWanted, { tracks: hub.wantedTracks }))
        }
      }
    }),
    defineInvokeHandler(context, ioTraceHubPing, (_, options) => {
      const sender = options?.raw.ipcMainEvent.sender
      for (const source of (sender ? windows.get(sender.id)?.sources : undefined) ?? [])
        hub.touch(source)
      return hub.now()
    }),
    defineInvokeHandler(context, ioTraceHubGet, () => hub.getState()),
    defineInvokeHandler(context, ioTraceHubSetCollecting, ({ collecting }) => hub.setCollecting(collecting)),
    defineInvokeHandler(context, ioTraceHubSubscribe, (payload, options) => {
      const sender = options?.raw.ipcMainEvent.sender
      const messages = sender ? startViewer(sender, payload?.tracks ?? '*') : []
      return { messages, traceClock: hub.collector.traceClock }
    }),
    defineInvokeHandler(context, ioTraceHubSetTracks, (payload, options) => {
      const sender = options?.raw.ipcMainEvent.sender
      if (sender && payload)
        windows.get(sender.id)?.viewer?.setTracks(payload.tracks)
    }),
    defineInvokeHandler(context, ioTraceHubUnsubscribe, (_, options) => {
      const sender = options?.raw.ipcMainEvent.sender
      const connected = sender ? windows.get(sender.id) : undefined
      connected?.viewer?.unsubscribe()
      if (connected)
        connected.viewer = undefined
    }),
  ]

  hub.start()
  return () => {
    hub.dispose()
    powerMonitor.off('resume', onResume)
    stopWanted()
    disposers.forEach(stop => stop())
    for (const id of [...windows.keys()])
      disconnect(id)
    dispose()
  }
}
