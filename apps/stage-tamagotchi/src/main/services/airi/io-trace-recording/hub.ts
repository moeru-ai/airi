import type { IOTraceRecordingService } from '.'
import type { IOTraceHub } from '../io-trace-hub'

/**
 * Writes the records of the hub to the recording files while recording is on.
 *
 * The hub receives the records of every window, so the files have the records of every window. The subscription
 * wants all tracks only while recording is on. While it is off, it wants none, so producers skip costly series that
 * no viewer shows. The backlog before `caughtUp` was recorded when it arrived, or it arrived while recording was off.
 *
 * Returns a function that ends the subscription.
 */
export function recordHubRecords(hub: IOTraceHub, service: IOTraceRecordingService, onError: (error: unknown) => void): () => void {
  let live = false
  const subscription = hub.subscribe((message) => {
    if (message.kind === 'caughtUp')
      live = true
    else if (live && message.kind === 'record')
      service.recordRecord(message.record).catch(onError)
  }, service.getState().enabled ? '*' : [])
  const stopStateChanges = service.onStateChange(state => subscription.setTracks(state.enabled ? '*' : []))
  return () => {
    stopStateChanges()
    subscription.unsubscribe()
  }
}
