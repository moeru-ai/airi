import type { EventContext } from '@moeru/eventa'

import { useLogg } from '@guiiai/logg'
import { defineInvoke } from '@moeru/eventa'
import { deserializeSpan, serializeSpan, setIOTraceSource, subscribeIOSpan } from '@proj-airi/stage-ui/composables/use-io-tracer'

import {
  ioTraceHubPublish,
  ioTraceHubSpan,
  ioTraceHubSubscribe,
  ioTraceHubUnsubscribe,
} from '../../shared/eventa'

const log = useLogg('electron:io-trace-hub').useGlobalConfig()

/**
 * Sends the ended IO spans of this window to the IO trace hub in the main process.
 *
 * The tracer view of this window then reads spans from the hub. So it shows the spans of every window, and the
 * spans that the hub kept before the view opened.
 */
export function initializeIOTraceHubBridge(context: EventContext<any, any>): () => void {
  const publish = defineInvoke(context, ioTraceHubPublish)
  const subscribe = defineInvoke(context, ioTraceHubSubscribe)
  const unsubscribe = defineInvoke(context, ioTraceHubUnsubscribe)

  const stopSpanListener = subscribeIOSpan((span) => {
    if (span.ended)
      void publish(serializeSpan(span)).catch(error => log.withError(error).error('Failed to publish IO trace span'))
  })

  const stopSource = setIOTraceSource({
    subscribe: async (onSpan) => {
      const stopPushListener = context.on(ioTraceHubSpan, (event) => {
        if (event.body)
          onSpan(deserializeSpan(event.body))
      })
      try {
        const spans = await subscribe()
        return {
          spans: (spans ?? []).map(deserializeSpan),
          unsubscribe: () => {
            stopPushListener()
            void unsubscribe().catch(error => log.withError(error).error('Failed to unsubscribe from the IO trace hub'))
          },
        }
      }
      catch (error) {
        stopPushListener()
        throw error
      }
    },
  })

  return () => {
    stopSpanListener()
    stopSource()
  }
}
