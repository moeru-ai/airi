import type { SparkNotifyResponseControl } from '@proj-airi/core-agent/agents/spark-notify'
import type { LlmStreamingControlCallManifest } from '@proj-airi/pipelines-audio'
import type { WebSocketEventOf } from '@proj-airi/server-sdk'

import { array, boolean, finite, looseObject, nonEmpty, number, optional, picklist, pipe, record, string, trim, unknown } from 'valibot'

type SparkNotifyProtocolEvent = WebSocketEventOf<'spark:notify'>
type SparkNotifyProtocolData = SparkNotifyProtocolEvent['data']

export type SparkNotifyReactionCallHandler = (payload?: Record<string, unknown>) => Promise<void> | void

/**
 * Registered performance call available during one spark notify reaction.
 */
export interface SparkNotifyReactionCallRegistration {
  /** Prompt manifest rendered into the model instructions and used as the dispatch key. */
  manifest: LlmStreamingControlCallManifest
  /** Runtime callback executed when the matching CALL token is emitted. */
  handler: SparkNotifyReactionCallHandler
}

/**
 * Result returned by the call-aware spark notify reaction bridge.
 */
export interface SparkNotifyPerformanceResult {
  /** Text reaction produced by the existing spark notify path. */
  reaction: string
  /** Terminal state for the performance request. */
  type: 'called' | 'completed' | 'timeout' | 'cancelled'
  /** Name of the generic performance call that resolved the request, when applicable. */
  name?: string
  /** Payload emitted by the matching CALL token, when applicable. */
  payload?: Record<string, unknown>
}

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
  /** Generic performance calls allowed during this spark notify reaction request. */
  calls?: SparkNotifyReactionCallRegistration[]
  /**
   * Maximum time to wait for a registered performance call after spark notify starts.
   *
   * @default 5000
   */
  timeoutMs?: number
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
