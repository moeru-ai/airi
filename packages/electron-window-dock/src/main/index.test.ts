import type { BrowserWindow, WebContents } from 'electron'

import type { DockConfig } from '..'

import { Buffer } from 'node:buffer'
import { EventEmitter } from 'node:events'

import { defineInvoke } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/electron/renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { setupWindowDock } from '.'
import { defaultDockConfig, windowDock } from '..'

type RendererIpc = Parameters<typeof createContext>[0]
type FakeWebContents = Pick<WebContents, 'id' | 'isDestroyed' | 'send'>
/** The members of the overlay window that the dock controller and the Eventa main adapter use. */
type FakeOverlayWindow = EventEmitter
  & Pick<BrowserWindow, 'id' | 'destroy' | 'getNativeWindowHandle' | 'getTitle' | 'hide' | 'isDestroyed' | 'setAlwaysOnTop' | 'setBounds' | 'setIgnoreMouseEvents' | 'showInactive'>
  & { webContents: FakeWebContents }

// `ipcMain` is an `EventEmitter` in Electron too. The fake renderers below send to it.
const { ipcMain } = await vi.hoisted(async () => {
  const { EventEmitter } = await import('node:events')
  return { ipcMain: new EventEmitter() }
})

vi.mock('electron', () => ({
  app: { name: 'AIRI' },
  ipcMain,
  BrowserWindow: { getAllWindows: () => [], getFocusedWindow: () => null, fromId: () => null },
  screen: { getAllDisplays: () => [], getDisplayMatching: () => ({ bounds: { x: 0, y: 0, width: 1920, height: 1080 } }) },
}))

/**
 * Connects one fake renderer to the fake `ipcMain`, the same way as the Electron IPC.
 * `webContents.send` delivers to the renderer, and the renderer sends to `ipcMain` with its `webContents` as the sender.
 */
function createRenderer(id: number) {
  const channel = new EventEmitter()
  const webContents: FakeWebContents = {
    id,
    isDestroyed: () => false,
    send: (name, ...args) => {
      channel.emit(name, {}, ...args)
    },
  }
  const ipcRenderer: Pick<RendererIpc, 'on' | 'removeListener' | 'send'> = {
    on: (name, listener) => {
      channel.on(name, listener)
      return () => channel.off(name, listener)
    },
    removeListener: (name, listener) => {
      channel.removeListener(name, listener)
      return ipcRenderer as RendererIpc
    },
    send: (name, ...args) => {
      ipcMain.emit(name, { sender: webContents }, ...args)
    },
  }
  const { context } = createContext(ipcRenderer as RendererIpc)
  return { webContents, context }
}

/** Creates a fake overlay window. `destroy()` emits `closed`, the same as a real window. */
function createOverlayWindow(webContents: FakeWebContents) {
  let destroyed = false
  const window: FakeOverlayWindow = Object.assign(new EventEmitter(), {
    id: 50,
    webContents,
    destroy: () => {
      destroyed = true
      window.emit('closed')
    },
    getNativeWindowHandle: () => Buffer.alloc(8),
    getTitle: () => 'AIRI Dock Overlay',
    hide: () => {},
    isDestroyed: () => destroyed,
    setAlwaysOnTop: () => {},
    setBounds: () => {},
    setIgnoreMouseEvents: () => {},
    showInactive: () => {},
  })
  return window as BrowserWindow
}

describe('setupWindowDock', () => {
  beforeEach(() => {
    // The first tick of a session reads the platform tracker. Fake timers keep the tick from running,
    // so that the result does not depend on the platform of the test machine.
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('sends the config to the overlay renderer at creation and after each accepted update', async () => {
    const overlay = createRenderer(2)
    const settings = createRenderer(1)
    const received: Required<DockConfig>[] = []
    const receivedBySettings: Required<DockConfig>[] = []
    overlay.context.on(windowDock.configChanged, event => received.push(event.body!))
    settings.context.on(windowDock.configChanged, event => receivedBySettings.push(event.body!))
    const dock = setupWindowDock({ createOverlayWindow: async () => createOverlayWindow(overlay.webContents) })

    await defineInvoke(settings.context, windowDock.start)({ targetId: 'electron:1' })

    expect(received).toEqual([defaultDockConfig])

    await defineInvoke(settings.context, windowDock.setConfig)({ hideOnHover: false })

    expect(received).toHaveLength(2)
    expect(received[1]).toEqual({ ...defaultDockConfig, hideOnHover: false })

    await expect(defineInvoke(settings.context, windowDock.setConfig)({ padding: -1 })).rejects.toThrow('padding')

    expect(received).toHaveLength(2)
    // The settings renderer sent each update, but only the overlay window gets the event.
    expect(receivedBySettings).toEqual([])

    dock.dispose()
  })

  it('sends nothing to the overlay after the session ends', async () => {
    const overlay = createRenderer(2)
    const settings = createRenderer(1)
    const received: Required<DockConfig>[] = []
    overlay.context.on(windowDock.configChanged, event => received.push(event.body!))
    const dock = setupWindowDock({ createOverlayWindow: async () => createOverlayWindow(overlay.webContents) })

    await defineInvoke(settings.context, windowDock.start)({ targetId: 'electron:1' })
    await defineInvoke(settings.context, windowDock.stop)()
    await defineInvoke(settings.context, windowDock.setConfig)({ hideOnHover: false })

    expect(received).toHaveLength(1)

    dock.dispose()
  })

  it('removes the IPC listeners of the overlay context when the overlay window closes', async () => {
    const overlay = createRenderer(2)
    const settings = createRenderer(1)
    // Each Eventa main context adds one `eventa-message` listener to `ipcMain`. A context that stays after
    // its window closes keeps its listener, so the count shows a leak across sessions.
    const listenersBefore = ipcMain.listenerCount('eventa-message')
    const dock = setupWindowDock({ createOverlayWindow: async () => createOverlayWindow(overlay.webContents) })
    const listenersWithoutSession = ipcMain.listenerCount('eventa-message')

    for (let session = 0; session < 2; session++) {
      await defineInvoke(settings.context, windowDock.start)({ targetId: 'electron:1' })

      expect(ipcMain.listenerCount('eventa-message')).toBe(listenersWithoutSession + 1)

      await defineInvoke(settings.context, windowDock.stop)()

      expect(ipcMain.listenerCount('eventa-message')).toBe(listenersWithoutSession)
    }

    dock.dispose()

    expect(ipcMain.listenerCount('eventa-message')).toBe(listenersBefore)
  })
})
