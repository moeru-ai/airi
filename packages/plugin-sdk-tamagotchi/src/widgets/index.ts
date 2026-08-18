import { defineEventa } from '@moeru/eventa'

/**
 * Channel name shared by tamagotchi hosts and plugin iframes for extension UI Eventa traffic.
 */
export const widgetsIframeChannel = 'airi:widgets:ui-iframe:channel'

/**
 * Snapshot payload forwarded from the host to initialize one extension UI bridge consumer.
 */
export interface WidgetsIframeInitPayload {
  /** Active module identifier when the host already resolved one. */
  moduleId?: string
  /** Current host-side module snapshot when available. */
  module?: Record<string, unknown>
  /** Structured-clone-safe config payload mirrored from the host. */
  config: Record<string, unknown>
  /** Structured-clone-safe runtime props mirrored from the host. */
  props: Record<string, unknown>
}

/**
 * Structured-clone-safe envelope forwarded across the extension UI bridge.
 */
export type WidgetsIframeEvent = Record<string, unknown>

export const widgetsIframeInitEvent = defineEventa<WidgetsIframeInitPayload>('eventa:event:widgets:ui-iframe:init')
export const widgetsIframeReadyEvent = defineEventa<void>('eventa:event:widgets:ui-iframe:ready')
export const widgetsIframePublishEvent = defineEventa<WidgetsIframeEvent>('eventa:event:widgets:ui-iframe:publish')
export const widgetsIframeBroadcastEvent = defineEventa<WidgetsIframeEvent>('eventa:event:widgets:ui-iframe:broadcast')
