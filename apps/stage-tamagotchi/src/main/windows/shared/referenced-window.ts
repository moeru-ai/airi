import type { BrowserWindow } from 'electron'

import type { createRequestWindowEventa, RequestWindowPayload } from '../../../shared/eventa'

import { defineInvokeHandler } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/electron/main'
import { ipcMain } from 'electron'

export interface ReferencedWindowHandle {
  id: string
  window: BrowserWindow
  context: ReturnType<typeof createContext>['context']
  eventa: ReturnType<typeof createRequestWindowEventa>
}

export interface ReferencedWindowManager<Payload extends RequestWindowPayload = RequestWindowPayload> {
  open: (payload: Payload & { id?: string }) => Promise<ReferencedWindowHandle>
  close: (id: string) => void
}

/**
 * Minimal per-id window manager used by notice/widgets-like windows.
 * It opens (or reuses) a window, loads the route with the id in query, and returns the window/context so
 * callers can register their own action handlers.
 */
export function createReferencedWindowManager<Payload extends RequestWindowPayload = RequestWindowPayload>(params: {
  eventa: ReturnType<typeof createRequestWindowEventa>
  createWindow: (id: string) => BrowserWindow
  loadRoute: (window: BrowserWindow, payload: Payload & { id: string }) => Promise<void>
}): ReferencedWindowManager<Payload> {
  const windows = new Map<string, { window: BrowserWindow, context: ReturnType<typeof createContext>['context'] }>()

  function bindContext(id: string, payload: Payload, win: BrowserWindow) {
    // TODO: once we refactored eventa to support window-namespaced contexts,
    // we can remove the setMaxListeners call below since eventa will be able to dispatch and
    // manage events within eventa's context system.
    ipcMain.setMaxListeners(0)
    const { context } = createContext(ipcMain, win)

    defineInvokeHandler(context, params.eventa.pageMounted, (req) => {
      if (req?.id && req.id !== id)
        return undefined
      return { id, type: payload.type, payload: payload.payload }
    })

    defineInvokeHandler(context, params.eventa.pageUnmounted, (req) => {
      if (req?.id && req.id !== id)
        return
      windows.delete(id)
    })

    win.on('closed', () => windows.delete(id))

    return { window: win, context }
  }

  async function open(payload: Payload & { id?: string }): Promise<ReferencedWindowHandle> {
    const id = payload.id ?? Math.random().toString(36).slice(2, 10)
    let ctx = windows.get(id)

    if (!ctx || ctx.window.isDestroyed()) {
      const win = params.createWindow(id)
      ctx = bindContext(id, payload, win)
      windows.set(id, ctx)
    }

    try {
      await params.loadRoute(ctx.window, { ...payload, id })
      ctx.window.show()
      ctx.window.focus()
    }
    catch (error) {
      const wrapped = error ?? new Error('Failed to open referenced window')
      console.error('[referenced-window] open failed', wrapped)
      throw wrapped
    }

    return { id, window: ctx.window, context: ctx.context, eventa: params.eventa }
  }

  function close(id: string) {
    const ctx = windows.get(id)
    if (!ctx)
      return
    if (!ctx.window.isDestroyed())
      ctx.window.close()
    windows.delete(id)
  }

  return { open, close }
}
