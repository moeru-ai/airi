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

/**
 * Value of `payload.type` on a {@link widgetsIframePublishEvent} envelope that
 * marks a gamelet's request for one host-driven AI character turn.
 */
export const gameletAiTurnEventType = 'gamelet:ai-turn'

/**
 * A gamelet's request for the host to run one AI character turn.
 *
 * A gamelet publishes this — wrapped in a {@link widgetsIframePublishEvent}
 * envelope as `{ payload: { type: gameletAiTurnEventType, request } }` — when
 * something happened that the AIRI character should react to. The host maps it
 * onto its own notification/reaction mechanism; the gamelet owns all
 * domain-specific wording, so the host stays generic across gamelets.
 */
export interface GameletAiTurnRequest {
  /** Short headline describing the trigger, for host-side notification UIs. */
  headline: string
  /** Instruction describing what happened and what the character should address. */
  instruction: string
  /**
   * Standing system-level guidance for the turn (e.g. a gamelet's protocol).
   * Appended to the character's system prompt; empty when the gamelet has none.
   */
  systemInstructions: string[]
  /** Spoken fallback line used when the model is unavailable. */
  fallbackText: string
}
