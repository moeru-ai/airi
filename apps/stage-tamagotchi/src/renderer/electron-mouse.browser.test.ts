import type { BrowserWindow, IpcMain, IpcMainEvent, IpcRendererEvent, WebContents } from 'electron'

import { defineInvokeHandler } from '@moeru/eventa'
import { createContext as createMainContext } from '@moeru/eventa/adapters/electron/main'
import { cursorScreenPoint, startLoopGetCursorScreenPoint } from '@proj-airi/electron-eventa'
import { getElectronEventaContext, useElectronMouse } from '@proj-airi/electron-vueuse'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { effectScope } from 'vue'

type RendererIpc = NonNullable<Parameters<typeof getElectronEventaContext>[0]>
type RendererListener = Parameters<RendererIpc['on']>[1]
type MainListener = Parameters<IpcMain['on']>[1]

/**
 * Connects the shared renderer context to a main process context through in-memory IPC.
 *
 * `@proj-airi/electron-vueuse` has no Vitest project. This project resolves the package as the renderer does.
 */
function connectMain() {
  const mainListeners = new Map<string, MainListener>()
  const rendererListeners = new Map<string, RendererListener>()
  const ipcMain: Pick<IpcMain, 'on' | 'off'> = {
    on: vi.fn((channel: string, listener: MainListener) => {
      mainListeners.set(channel, listener)
      return ipcMain as IpcMain
    }),
    off: vi.fn((channel: string) => {
      mainListeners.delete(channel)
      return ipcMain as IpcMain
    }),
  }
  const webContents: Pick<WebContents, 'id' | 'isDestroyed' | 'send'> = {
    id: 1,
    isDestroyed: () => false,
    send: vi.fn((channel: string, body: unknown) => {
      const message = structuredClone(body)
      queueMicrotask(() => rendererListeners.get(channel)?.({} as IpcRendererEvent, message))
    }),
  }
  const browserWindow: Pick<BrowserWindow, 'webContents' | 'isDestroyed'> = { webContents: webContents as WebContents, isDestroyed: () => false }
  const ipcRenderer: Pick<RendererIpc, 'on' | 'removeListener' | 'send'> = {
    on: vi.fn((channel: string, listener: RendererListener) => {
      rendererListeners.set(channel, listener)
      return () => rendererListeners.delete(channel)
    }),
    removeListener: vi.fn((channel: string) => {
      rendererListeners.delete(channel)
      return ipcRenderer as RendererIpc
    }),
    send: vi.fn((channel: string, body: unknown) => {
      const message = structuredClone(body)
      queueMicrotask(() => mainListeners.get(channel)?.({ sender: webContents as WebContents } as IpcMainEvent, message))
    }),
  }
  const main = createMainContext(ipcMain as IpcMain, browserWindow as BrowserWindow)
  getElectronEventaContext(ipcRenderer as RendererIpc)
  onTestFinished(() => main.dispose())

  return main.context
}

describe('useElectronMouse', () => {
  it('gives a consumer that mounts while the cursor stays still the last position', async () => {
    const main = connectMain()
    defineInvokeHandler(main, startLoopGetCursorScreenPoint, () => {})
    const scope = effectScope()
    onTestFinished(() => scope.stop())
    const first = scope.run(() => useElectronMouse())!

    // The main process sends a position only when it changes, so no message follows while the cursor stays still.
    main.emit(cursorScreenPoint, { x: 10, y: 20 })
    await vi.waitFor(() => expect(first.x.value).toBe(10))

    const late = scope.run(() => useElectronMouse())!
    expect(late.x.value).toBe(10)
    expect(late.y.value).toBe(20)
  })
})
