import type { BrowserWindow } from 'electron'

import { createContext } from '@moeru/eventa'
import { describe, expect, it, vi } from 'vitest'

import { widgetsIframeRequestResultEvent } from '../../../../shared/eventa'
import { createWidgetsService } from './index'

function createWindow(id: number): BrowserWindow {
  return {
    webContents: {
      id,
    },
  } as BrowserWindow
}

function createWidgetsManager() {
  return {
    clearWidgets: vi.fn(),
    fetchWidget: vi.fn(),
    getWindow: vi.fn(),
    getWidgetSnapshot: vi.fn(),
    hideWindow: vi.fn(),
    onWidgetEvent: vi.fn(),
    openWindow: vi.fn(),
    prepareWidgetWindow: vi.fn(),
    publishWidgetEvent: vi.fn(),
    publishWidgetIframeRequestResult: vi.fn(),
    pushWidget: vi.fn(),
    removeWidget: vi.fn(),
    requestWidgetIframe: vi.fn(),
    updateWidget: vi.fn(),
  }
}

describe('createWidgetsService', () => {
  it('routes iframe request results from the widgets window to the manager', () => {
    const context = createContext()
    const widgetsManager = createWidgetsManager()
    const window = createWindow(1)
    createWidgetsService({
      context: context as Parameters<typeof createWidgetsService>[0]['context'],
      widgetsManager,
      window,
    })

    context.emit(widgetsIframeRequestResultEvent, {
      id: 'kit-module:board',
      requestId: 'req-1',
      ok: true,
      result: { fen: 'fen-after-request' },
    }, {
      raw: {
        ipcMainEvent: {
          sender: { id: 1 },
        },
      },
    } as never)

    expect(widgetsManager.publishWidgetIframeRequestResult).toHaveBeenCalledWith({
      id: 'kit-module:board',
      requestId: 'req-1',
      ok: true,
      result: { fen: 'fen-after-request' },
    })
  })

  it('ignores iframe request results from other windows', () => {
    const context = createContext()
    const widgetsManager = createWidgetsManager()
    const window = createWindow(1)
    createWidgetsService({
      context: context as Parameters<typeof createWidgetsService>[0]['context'],
      widgetsManager,
      window,
    })

    context.emit(widgetsIframeRequestResultEvent, {
      id: 'kit-module:board',
      requestId: 'req-1',
      ok: true,
      result: { fen: 'fen-after-request' },
    }, {
      raw: {
        ipcMainEvent: {
          sender: { id: 2 },
        },
      },
    } as never)

    expect(widgetsManager.publishWidgetIframeRequestResult).not.toHaveBeenCalled()
  })
})
