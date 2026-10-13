import type { InvocableEventContext } from '@moeru/eventa'
import type { BrowserWindow } from 'electron'

import type { IOTraceRecordingService } from '.'

import { defineInvokeHandler } from '@moeru/eventa'

import {
  ioTraceRecordingChanged,
  ioTraceRecordingGet,
  ioTraceRecordingRecordSpan,
  ioTraceRecordingSetEnabled,
} from '../../../../shared/eventa'

export function registerIOTraceRecording(
  context: InvocableEventContext<any, any>,
  service: IOTraceRecordingService,
  window: BrowserWindow,
): () => void {
  const disposers = [
    defineInvokeHandler(context, ioTraceRecordingGet, () => service.getState()),
    defineInvokeHandler(context, ioTraceRecordingSetEnabled, ({ enabled }) => service.setEnabled(enabled)),
    // NOTICE:
    // Every window context listens on the shared `ipcMain`, so each registered window also receives the spans of
    // the other windows. Without this check, an open settings window writes each span of the main window twice.
    // Get and set stay unchecked: they are idempotent, and a handler that returns early would answer with undefined.
    // Source: the eventa TODO about window-namespaced contexts in main/windows/*/rpc/index.electron.ts.
    // Remove this check when eventa dispatches invokes only to the context of the sender window.
    defineInvokeHandler(context, ioTraceRecordingRecordSpan, (span, options) => {
      if (options?.raw.ipcMainEvent.sender.id === window.webContents.id)
        return service.recordSpan(span)
    }),
    service.onStateChange((state) => {
      void context.emit(ioTraceRecordingChanged, state)
    }),
  ]

  return () => disposers.forEach(dispose => dispose())
}
