import type { SparkNotifyResponseControl } from '@proj-airi/core-agent/agents/spark-notify'
import type { LlmStreamingControlCallManifest } from '@proj-airi/pipelines-audio'
import type { WebSocketEventOf } from '@proj-airi/server-sdk'

import { array, boolean, finite, looseObject, nonEmpty, number, optional, picklist, pipe, record, string, trim, unknown } from 'valibot'

/**
 * Result returned by the call-aware spark notify reaction bridge.
 */
export interface SparkNotifyPerformanceResult {
  /** Name of the generic performance call that resolved the request, when applicable. */
  name?: string
  /** Payload emitted by the matching CALL token, when applicable. */
  payload?: Record<string, unknown>
  /** Text reaction produced by the existing spark notify path. */
  reaction: string
  /** Terminal state for the performance request. */
  type: 'called' | 'cancelled' | 'completed' | 'timeout'
}
export type SparkNotifyReactionCallHandler = (payload?: Record<string, unknown>) => Promise<void> | void

/**
 * Registered performance call available during one spark notify reaction.
 */
export interface SparkNotifyReactionCallRegistration {
  /** Runtime callback executed when the matching CALL token is emitted. */
  handler: SparkNotifyReactionCallHandler
  /** Prompt manifest rendered into the model instructions and used as the dispatch key. */
  manifest: LlmStreamingControlCallManifest
}

/**
 * Caller-facing request used by the context bridge to turn one spark notification into a reaction string.
 */
export interface SparkNotifyReactionOptions
  extends Partial<Pick<
    SparkNotifyProtocolData,
    | 'lane'
    | 'metadata'
    | 'note'
    | 'payload'
    | 'requiresAck'
    | 'ttlMs'
  >>, SparkNotifyResponseControl {
  /** Generic performance calls allowed during this spark notify reaction request. */
  calls?: SparkNotifyReactionCallRegistration[]
  /**
   * Target reaction destinations.
   *
   * @default ['character']
   */
  destinations?: SparkNotifyProtocolData['destinations']
  /** Response text returned when the reaction runtime cannot produce a usable response. */
  fallbackResponseText: string
  /** Short title for the event that should be visible to the reaction runtime. */
  headline: SparkNotifyProtocolData['headline']
  /**
   * Notification category.
   *
   * @default 'ping'
   */
  kind?: SparkNotifyProtocolData['kind']
  /**
   * Event source label used by the downstream spark notification event.
   *
   * @default 'plugin-module-host'
   */
  source?: SparkNotifyProtocolEvent['source']
  /**
   * Maximum time to wait for a registered performance call after spark notify starts.
   *
   * @default 5000
   */
  timeoutMs?: number
  /**
   * Notification scheduling urgency.
   *
   * @default 'immediate'
   */
  urgency?: SparkNotifyProtocolData['urgency']
}

type SparkNotifyProtocolData = SparkNotifyProtocolEvent['data']

type SparkNotifyProtocolEvent = WebSocketEventOf<'spark:notify'>

export const sparkNotifyReactionOptionsSchema = looseObject({
  destinations: optional(array(string())),
  fallbackResponseText: string(),
  forceResponse: optional(boolean()),
  forceSparkCommandResponse: optional(boolean()),
  forceTextResponse: optional(boolean()),
  headline: pipe(string(), trim(), nonEmpty()),
  kind: optional(picklist(['alarm', 'ping', 'reminder'])),
  lane: optional(string()),
  metadata: optional(record(string(), unknown())),
  note: optional(string()),
  payload: optional(record(string(), unknown())),
  requiresAck: optional(boolean()),
  source: optional(string()),
  ttlMs: optional(pipe(number(), finite())),
  urgency: optional(picklist(['immediate', 'soon', 'later'])),
})
