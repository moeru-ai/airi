import type { EventContext } from '@moeru/eventa'
import type { ReadableSpan } from '@proj-airi/stage-ui/composables/use-io-tracer'

import { useLogg } from '@guiiai/logg'
import { defineInvoke } from '@moeru/eventa'
import { configureIOTraceRecordingController } from '@proj-airi/stage-ui/composables/io-trace-recording'
import { serializeSpan, subscribeIOSpan } from '@proj-airi/stage-ui/composables/use-io-tracer'

import {
  ioTraceRecordingChanged,
  ioTraceRecordingGet,
  ioTraceRecordingGetSpans,
  ioTraceRecordingRecordSpan,
  ioTraceRecordingSetEnabled,
} from '../../shared/eventa'

interface InitializeIOTraceRecordingBridgeOptions {
  context: EventContext<any, any>
  forwardLocalSpans: boolean
  subscribeSpan?: (listener: (span: ReadableSpan) => void) => () => void
}

export function initializeIOTraceRecordingBridge(options: InitializeIOTraceRecordingBridgeOptions): () => void {
  const log = useLogg('electron:io-trace-recording')
  const getState = defineInvoke(options.context, ioTraceRecordingGet)
  const getSpans = defineInvoke(options.context, ioTraceRecordingGetSpans)
  const setEnabled = defineInvoke(options.context, ioTraceRecordingSetEnabled)
  const recordSpan = defineInvoke(options.context, ioTraceRecordingRecordSpan)

  void configureIOTraceRecordingController({
    getState,
    getSpans,
    onStateChange: listener => options.context.on(ioTraceRecordingChanged, (event) => {
      if (event.body)
        listener(event.body)
    }),
    setEnabled: enabled => setEnabled({ enabled }),
  })

  const stopSpanForwarding = options.forwardLocalSpans
    ? (options.subscribeSpan ?? subscribeIOSpan)((span) => {
        if (!span.ended)
          return
        void recordSpan(serializeSpan(span)).catch(error => log.withError(error).error('Failed to record IO trace span'))
      })
    : undefined

  return () => {
    stopSpanForwarding?.()
    void configureIOTraceRecordingController(undefined)
  }
}
