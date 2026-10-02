import type { InvocableEventContext } from '@moeru/eventa'

import type { IOTraceRecordingService } from '.'

import { defineInvokeHandler } from '@moeru/eventa'

import {
  ioTraceRecordingChanged,
  ioTraceRecordingGet,
  ioTraceRecordingGetSpans,
  ioTraceRecordingRecordSpan,
  ioTraceRecordingSetEnabled,
} from '../../../../shared/eventa'

export function registerIOTraceRecording(
  context: InvocableEventContext<any, any>,
  service: IOTraceRecordingService,
): () => void {
  const disposers = [
    defineInvokeHandler(context, ioTraceRecordingGet, () => service.getState()),
    defineInvokeHandler(context, ioTraceRecordingGetSpans, () => service.getRecordedSpans()),
    defineInvokeHandler(context, ioTraceRecordingSetEnabled, ({ enabled }) => service.setEnabled(enabled)),
    defineInvokeHandler(context, ioTraceRecordingRecordSpan, span => service.recordSpan(span)),
    service.onStateChange((state) => {
      void context.emit(ioTraceRecordingChanged, state)
    }),
  ]

  return () => {
    for (const dispose of disposers)
      dispose()
  }
}
