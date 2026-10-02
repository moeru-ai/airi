/** Lifecycle phase observed for one Pinia action invocation. */
export type PiniaActionEventStatus = 'started' | 'completed' | 'failed'

/** Broadcast channel used by Pinia action tracing producers and consumers. */
export const piniaActionTracingChannelName = 'airi-pinia-action-tracing'

/** Test-safe metadata emitted for one Pinia action lifecycle transition. */
export interface PiniaActionEvent {
  /** Correlates lifecycle events from the same action invocation. */
  invocationId: string
  /** Name passed to `defineStore`. */
  storeId: string
  /** Action property name reported by Pinia. */
  actionName: string
  status: PiniaActionEventStatus
  timestamp: number
  /** Renderer URL that invoked the action, when available. */
  sourceUrl?: string
  /** Safe error text included only for failed actions. */
  errorMessage?: string
}
