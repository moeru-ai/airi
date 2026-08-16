import type { PiniaActionEvent, PiniaActionEventStatus } from '@proj-airi/stage-shared/types/pinia-action-event'
import type { PiniaPlugin } from 'pinia'

import { errorMessageFrom } from '@moeru/std'
import { piniaActionTracingChannelName } from '@proj-airi/stage-shared/types/pinia-action-event'
import { nanoid } from 'nanoid/non-secure'

const piniaActionChannel = new BroadcastChannel(piniaActionTracingChannelName)

function emitActionEvent(
  event: Omit<PiniaActionEvent, 'status' | 'timestamp'>,
  status: PiniaActionEventStatus,
  error?: unknown,
): void {
  piniaActionChannel.postMessage({
    ...event,
    status,
    timestamp: Date.now(),
    ...(status === 'failed' ? { errorMessage: errorMessageFrom(error) ?? 'Unknown action failure' } : {}),
  })
}

/**
 * Traces Pinia action lifecycle events through a broadcast channel.
 *
 * The plugin never retains action arguments, results, or state snapshots.
 */
export const piniaPluginTracing: PiniaPlugin = ({ store }) => {
  store.$onAction(({ name, after, onError }) => {
    const event = {
      invocationId: nanoid(),
      storeId: store.$id,
      actionName: name,
      ...(typeof location === 'undefined' ? {} : { sourceUrl: location.href }),
    }

    emitActionEvent(event, 'started')
    after(() => emitActionEvent(event, 'completed'))
    onError(error => emitActionEvent(event, 'failed', error))
  })
}
