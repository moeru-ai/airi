import type { SparkNotifyResponseControl } from '@proj-airi/core-agent/agents/spark-notify'
import type { WebSocketEventOf } from '@proj-airi/server-sdk'

import { array, boolean, finite, looseObject, nonEmpty, number, optional, picklist, pipe, record, string, trim, unknown } from 'valibot'

type SparkNotifyProtocolEvent = WebSocketEventOf<'spark:notify'>
type SparkNotifyProtocolData = SparkNotifyProtocolEvent['data']

/**
 * Caller-facing request used by the context bridge to turn one spark notification into a reaction string.
 */
export interface SparkNotifyReactionOptions
  extends Partial<Pick<
    SparkNotifyProtocolData,
    | 'lane'
    | 'note'
    | 'payload'
    | 'ttlMs'
    | 'requiresAck'
    | 'metadata'
  >>, SparkNotifyResponseControl {
  /** Short title for the event that should be visible to the reaction runtime. */
  headline: SparkNotifyProtocolData['headline']
  /** Response text returned when the reaction runtime cannot produce a usable response. */
  fallbackResponseText: string
  /**
   * Notification category.
   *
   * @default 'ping'
   */
  kind?: SparkNotifyProtocolData['kind']
  /**
   * Notification scheduling urgency.
   *
   * @default 'immediate'
   */
  urgency?: SparkNotifyProtocolData['urgency']
  /**
   * Target reaction destinations.
   *
   * @default ['character']
   */
  destinations?: SparkNotifyProtocolData['destinations']
  /**
   * Event source label used by the downstream spark notification event.
   *
   * @default 'plugin-module-host'
   */
  source?: SparkNotifyProtocolEvent['source']
}

export const sparkNotifyReactionOptionsSchema = looseObject({
  headline: pipe(string(), trim(), nonEmpty()),
  fallbackResponseText: string(),
  kind: optional(picklist(['alarm', 'ping', 'reminder'])),
  urgency: optional(picklist(['immediate', 'soon', 'later'])),
  note: optional(string()),
  payload: optional(record(string(), unknown())),
  metadata: optional(record(string(), unknown())),
  lane: optional(string()),
  destinations: optional(array(string())),
  source: optional(string()),
  ttlMs: optional(pipe(number(), finite())),
  requiresAck: optional(boolean()),
  forceResponse: optional(boolean()),
  forceTextResponse: optional(boolean()),
  forceSparkCommandResponse: optional(boolean()),
})
