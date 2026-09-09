import type { BrowserWindow } from 'electron'

import process from 'node:process'

import { EventEmitter } from 'node:events'

import { defineInvoke } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/electron/renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { readAmbientCapture, startAmbientCapture, stopAmbientCapture } from '../../../shared/screen-ambient-capture'
import { setupAmbientCapture } from './ambient-capture-window'

const native = vi.hoisted(() => ({ stop: vi.fn(), read: vi.fn(async () => null) }))
vi.mock('./ambient-capture', () => ({ AmbientCapture: class {
  ready = Promise.resolve()
  read = native.read
  stop = native.stop
} }))
vi.mock('electron', async () => {
  const { EventEmitter } = await import('node:events')
  return {
    ipcMain: new EventEmitter(),
    app: { isPackaged: false, getAppPath: () => '/app' },
    screen: { getAllDisplays: () => [{ id: 17 }] },
  }
})

const cleanup: Array<() => void> = []
afterEach(() => {
  cleanup.splice(0).forEach(dispose => dispose())
  vi.clearAllMocks()
})

async function stage() {
  const { ipcMain } = await import('electron')
  const messages = new EventEmitter()
  const contents = Object.assign(new EventEmitter(), {
    id: 2,
    isDestroyed: () => false,
    send: (channel: string, payload: unknown) => messages.emit(channel, {}, payload),
  })
  const window = Object.assign(new EventEmitter(), {
    webContents: contents,
    isDestroyed: () => false,
    getMediaSourceId: () => 'window:7:0',
  })
  // These fakes implement the Electron IPC boundary used by the real adapters.
  const transport = {
    on: (channel: string, listener: (...args: unknown[]) => void) => {
      messages.on(channel, listener)
      return () => messages.off(channel, listener)
    },
    removeListener: (channel: string, listener: (...args: unknown[]) => void) => messages.off(channel, listener),
    send: (channel: string, payload: unknown) => ipcMain.emit(channel, { sender: contents }, payload),
  }
  setupAmbientCapture(window as unknown as BrowserWindow)
  const client = createContext(transport as unknown as Parameters<typeof createContext>[0])
  cleanup.push(() => {
    window.emit('closed')
    client.dispose()
  })
  const start = defineInvoke(client.context, startAmbientCapture)
  const read = defineInvoke(client.context, readAmbientCapture)
  const stop = defineInvoke(client.context, stopAmbientCapture)
  const options = { displayId: 17, width: 16, height: 10, frameRate: 20 }
  return { contents, start: () => start(options), read, stop }
}

describe.runIf(process.platform === 'darwin')('stage capture ownership', () => {
  it('keeps capture across same-document navigation and stops on document replacement', async () => {
    const owner = await stage()
    const id = (await owner.start())!
    owner.contents.emit('did-start-navigation', {}, 'app/#/', true, true)
    await expect(owner.read(id)).resolves.toBeNull()
    expect(native.stop).not.toHaveBeenCalled()
    owner.contents.emit('did-start-navigation', {}, 'app/', false, true)
    await expect(owner.read(id)).rejects.toThrow('no longer active')
    expect(native.stop).toHaveBeenCalledOnce()
  })

  it('does not let an old stop close a replacement session', async () => {
    const owner = await stage()
    const previous = (await owner.start())!
    const current = (await owner.start())!
    await owner.stop(previous)
    await expect(owner.read(current)).resolves.toBeNull()
    expect(native.stop).toHaveBeenCalledOnce()
  })
})
