/** Lifecycle phase observed for one Pinia action invocation. */
export type PiniaActionEventStatus = 'completed' | 'failed' | 'started'

/** Broadcast channel used by Pinia action tracing producers and consumers. */
export const piniaActionTracingChannelName = 'airi-pinia-action-tracing'

/** Test-safe metadata emitted for one Pinia action lifecycle transition. */
export interface PiniaActionEvent {
  /** Action property name reported by Pinia. */
  actionName: string
  /** Safe error text included only for failed actions. */
  errorMessage?: string
  /** Correlates lifecycle events from the same action invocation. */
  invocationId: string
  /** Renderer URL that invoked the action, when available. */
  sourceUrl?: string
  status: PiniaActionEventStatus
  /** Name passed to `defineStore`. */
  storeId: string
  timestamp: number
}
