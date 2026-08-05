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
      // NOTICE:
      // eventa beta.14 widened EventContext generics so the direct cast no longer
      // overlaps; Parameters<> keeps the target in sync with the service contract.
      // Root cause: @moeru/eventa 1.0.0-beta.14 EventContext type change.
      // Removal condition: when createContext() returns the service's context type.
      context: context as unknown as Parameters<typeof createWidgetsService>[0]['context'],
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
      context: context as unknown as Parameters<typeof createWidgetsService>[0]['context'],
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
