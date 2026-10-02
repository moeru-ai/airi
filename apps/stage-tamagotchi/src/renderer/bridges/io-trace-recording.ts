import type { EventContext } from '@moeru/eventa'

import { useLogg } from '@guiiai/logg'
import { defineInvoke } from '@moeru/eventa'
import { serializeSpan, subscribeIOSpan } from '@proj-airi/stage-ui/composables/use-io-tracer'

import {
  ioTraceRecordingChanged,
  ioTraceRecordingGet,
  ioTraceRecordingRecordSpan,
} from '../../shared/eventa'

const log = useLogg('electron:io-trace-recording').useGlobalConfig()

export function initializeIOTraceRecordingBridge(context: EventContext<any, any>): () => void {
  const recordSpan = defineInvoke(context, ioTraceRecordingRecordSpan)
  let enabled = false

  const stopStateListener = context.on(ioTraceRecordingChanged, (event) => {
    enabled = event.body?.enabled ?? false
  })
  void defineInvoke(context, ioTraceRecordingGet)()
    .then((state) => {
      enabled = state?.enabled ?? false
    })
    .catch(error => log.withError(error).error('Failed to load IO trace recording state'))

  const stopSpanListener = subscribeIOSpan((span) => {
    if (enabled && span.ended)
      void recordSpan(serializeSpan(span)).catch(error => log.withError(error).error('Failed to record IO trace span'))
  })

  return () => {
    stopStateListener()
    stopSpanListener()
  }
}
