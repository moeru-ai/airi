import type { createContext } from '@moeru/eventa/adapters/electron/main'
import type { BrowserWindow, IpcMainEvent } from 'electron'

import type { WidgetsWindowManager } from '../../../windows/widgets'

import { defineInvokeHandlers } from '@moeru/eventa'

import {
  widgetsAdd,
  widgetsClear,
  widgetsFetch,
  widgetsHideWindow,
  widgetsIframePublish,
  widgetsOpenWindow,
  widgetsPrepareWindow,
  widgetsRemove,
  widgetsUpdate,
} from '../../../../shared/eventa'
import {
  normalizeOptionalWidgetId,
  normalizeRequiredWidgetId,
  validateWidgetIframeEvent,
  validateWidgetsAddPayload,
  validateWidgetsUpdatePayload,
} from './validation'

interface InvokeOptions {
  raw?: { ipcMainEvent?: IpcMainEvent }
}

function isFromWindow(options: InvokeOptions | undefined, window: BrowserWindow) {
  const sender = options?.raw?.ipcMainEvent?.sender
  if (!sender)
    return false
  return sender.id === window.webContents.id
}

/**
 * Registers widget-related Electron invoke handlers for one window context.
 *
 * Use when:
 * - A main-process window should expose widget management invokes to its renderer
 * - Widget requests must be validated before reaching {@link WidgetsWindowManager}
 *
 * Expects:
 * - `context` is an Eventa context bound to the target Electron window
 * - `window` is the only renderer allowed to use the registered invokes
 *
 * Returns:
 * - Registers handlers on the provided context and does not return a value
 *
 * Call stack:
 *
 * createWidgetsService (./index)
 *   -> {@link defineInvokeHandlers}
 *     -> {@link validateWidgetsAddPayload}
 *       -> {@link WidgetsWindowManager.pushWidget}
 */
export function createWidgetsService(params: { context: ReturnType<typeof createContext>['context'], widgetsManager: WidgetsWindowManager, window: BrowserWindow }) {
  defineInvokeHandlers(params.context, {
    widgetsPrepareWindow,
    widgetsOpenWindow,
    widgetsHideWindow,
    widgetsAdd,
    widgetsUpdate,
    widgetsRemove,
    widgetsClear,
    widgetsFetch,
    widgetsIframePublish,
  }, {
    widgetsPrepareWindow: async (payload, options) => {
      if (!isFromWindow(options as InvokeOptions, params.window))
        return undefined
      const id = normalizeOptionalWidgetId(payload?.id)
      return params.widgetsManager.prepareWidgetWindow(id ? { id } : undefined)
    },
    widgetsOpenWindow: async (payload, options) => {
      if (!isFromWindow(options as InvokeOptions, params.window))
        return undefined
      const id = normalizeOptionalWidgetId(payload?.id)
      return params.widgetsManager.openWindow(id ? { id } : undefined)
    },
    widgetsHideWindow: async (payload, options) => {
      if (!isFromWindow(options as InvokeOptions, params.window))
        return undefined
      return params.widgetsManager!.hideWindow(payload ?? undefined)
    },
    widgetsAdd: async (payload, options) => {
      if (!isFromWindow(options as InvokeOptions, params.window))
        return undefined
      return params.widgetsManager.pushWidget(validateWidgetsAddPayload(payload))
    },
    widgetsUpdate: async (payload, options) => {
      if (!isFromWindow(options as InvokeOptions, params.window))
        return undefined
      return params.widgetsManager.updateWidget(validateWidgetsUpdatePayload(payload))
    },
    widgetsRemove: async (payload, options) => {
      if (!isFromWindow(options as InvokeOptions, params.window))
        return undefined
      return params.widgetsManager.removeWidget(
        normalizeRequiredWidgetId(payload?.id, 'id is required to remove a widget.'),
      )
    },
    widgetsClear: async (_payload, options) => {
      if (!isFromWindow(options as InvokeOptions, params.window))
        return undefined
      return params.widgetsManager.clearWidgets()
    },
    widgetsFetch: async (payload, options) => {
      if (!isFromWindow(options as InvokeOptions, params.window))
        return undefined
      return params.widgetsManager.getWidgetSnapshot(
        normalizeRequiredWidgetId(payload?.id, 'id is required to fetch a widget snapshot.'),
      )
    },
    widgetsIframePublish: async (payload, options) => {
      if (!isFromWindow(options as InvokeOptions, params.window))
        return undefined
      const id = normalizeRequiredWidgetId(payload?.id, 'id is required to publish a widget iframe event.')
      params.widgetsManager.publishWidgetEvent(id, validateWidgetIframeEvent(payload?.event))
    },
  })
}
