import type { createContext } from '@moeru/eventa/adapters/electron/main'
import type { BrowserWindow, IpcMainEvent } from 'electron'

import type { WidgetsWindowManager } from '../../../windows/widgets'

import { defineInvokeHandlers } from '@moeru/eventa'

import { widgetsAdd, widgetsClear, widgetsFetch, widgetsOpenWindow, widgetsPrepareWindow, widgetsRemove, widgetsUpdate } from '../../../../shared/eventa'

interface InvokeOptions {
  raw?: { ipcMainEvent?: IpcMainEvent }
}

function isFromWindow(options: InvokeOptions | undefined, window: BrowserWindow) {
  const sender = options?.raw?.ipcMainEvent?.sender
  if (!sender)
    return false
  return sender.id === window.webContents.id
}

export function createWidgetsService(params: { context: ReturnType<typeof createContext>['context'], widgetsManager: WidgetsWindowManager, window: BrowserWindow }) {
  defineInvokeHandlers(params.context, {
    widgetsPrepareWindow,
    widgetsOpenWindow,
    widgetsAdd,
    widgetsUpdate,
    widgetsRemove,
    widgetsClear,
    widgetsFetch,
  }, {
    widgetsPrepareWindow: async (payload, options) => {
      if (!isFromWindow(options as InvokeOptions, params.window))
        return undefined
      return params.widgetsManager!.prepareWidgetWindow(payload ?? undefined)
    },
    widgetsOpenWindow: async (payload, options) => {
      if (!isFromWindow(options as InvokeOptions, params.window))
        return undefined
      return params.widgetsManager!.openWindow(payload ?? undefined)
    },
    widgetsAdd: async (payload, options) => {
      if (!isFromWindow(options as InvokeOptions, params.window))
        return undefined
      return payload ? params.widgetsManager!.pushWidget(payload) : undefined
    },
    widgetsUpdate: async (payload, options) => {
      if (!isFromWindow(options as InvokeOptions, params.window))
        return undefined
      return payload ? params.widgetsManager!.updateWidget(payload) : undefined
    },
    widgetsRemove: async (payload, options) => {
      if (!isFromWindow(options as InvokeOptions, params.window))
        return undefined
      return payload?.id ? params.widgetsManager!.removeWidget(payload.id) : undefined
    },
    widgetsClear: async (_payload, options) => {
      if (!isFromWindow(options as InvokeOptions, params.window))
        return undefined
      return params.widgetsManager!.clearWidgets()
    },
    widgetsFetch: async (payload, options) => {
      if (!isFromWindow(options as InvokeOptions, params.window))
        return undefined
      return payload?.id ? params.widgetsManager!.getWidgetSnapshot(payload.id) : undefined
    },
  })
}
