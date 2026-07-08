import type { Database } from '../../libs/db'
import type { ProductMetrics } from '../../otel'
import type { ProductEventMetadata } from '../../schemas/product-events'
import type { PosthogSink } from '../adapters/posthog'

import { useLogger } from '@guiiai/logg'
import { and, asc, count, gte, lt, sql } from 'drizzle-orm'

import * as schema from '../../schemas/product-events'

const logger = useLogger('product-events')

export type ProductFeature = 'auth' | 'chat' | 'gen_ai_chat' | 'tts' | 'billing' | 'voice_pack'

export type ProductEventStatus = 'started' | 'succeeded' | 'failed' | 'blocked'

export type ProductAction
  = | 'user_signed_up'
    | 'session_started'
    | 'message_pushed'
    | 'completion_requested'
    | 'completion_succeeded'
    | 'completion_failed'
    | 'speech_requested'
    | 'speech_succeeded'
    | 'speech_failed'
    | 'speech_blocked'
    | 'voice_pack_created'
    | 'voice_pack_updated'
    | 'voice_pack_disabled'
    | 'checkout_started'
    | 'payment_completed'
    | 'subscription_started'
    | 'subscription_renewed'
    | 'subscription_cancelled'
    | 'topic_classified'

/**
 * Product event fact written to AIRI's own Postgres analytics table.
 */
export interface ProductEventInput {
  /** Better Auth user id. Kept in Postgres only; never emitted as a Prometheus label. */
  userId: string
  /** Bounded product area used for product dashboards and funnels. */
  feature: ProductFeature
  /** Bounded user/business action within the feature. */
  action: ProductAction
  /** Lifecycle state for the action. */
  status: ProductEventStatus
  /** Optional bounded route/surface label such as `openai.chat.completions`. */
  source?: string
  /** Optional model alias for DB-side drilldown. Do not expose as a Prometheus label. */
  model?: string
  /** Optional provider name for DB-side drilldown. */
  provider?: string
  /** Optional bounded failure reason or business outcome. */
  reason?: string
  /** Optional primitive metadata for product analysis. Avoid PII and raw prompts. */
  metadata?: ProductEventMetadata
  /** Override for tests/backfills. Defaults to database/server current time. */
  createdAt?: Date
}

export interface ProductEventAggregateInput {
  /** Inclusive lower time bound. */
  from: Date
  /** Exclusive upper time bound. Omit for open-ended queries. */
  to?: Date
}

export interface ProductEventAggregateRow {
  feature: string
  action: string
  status: string
  eventCount: number
  distinctUsers: number
}

/**
 * Server-side actions worth a PostHog copy, mapped to the event name the
 * client-side funnels expect. Only business facts that terminate or anchor
 * a funnel are forwarded — per-request LLM/TTS volume stays in Postgres and
 * Grafana where it belongs (see `docs/ai-context/metrics-ownership.md`).
 *
 * `user_signed_up` maps to `signup_completed` because that is the canonical
 * activation-funnel step name the browser surfaces emit; the server copy
 * covers OAuth signups the auth UI cannot classify client-side.
 */
const POSTHOG_FORWARDED_ACTIONS: Partial<Record<ProductAction, string>> = {
  user_signed_up: 'signup_completed',
  payment_completed: 'payment_completed',
  subscription_started: 'subscription_started',
  subscription_renewed: 'subscription_renewed',
  subscription_cancelled: 'subscription_cancelled',
}

/**
 * Builds bounded Prometheus labels from product event inputs.
 */
function metricLabels(input: ProductEventInput): Record<string, string> {
  const attrs: Record<string, string> = {
    feature: input.feature,
    action: input.action,
    status: input.status,
  }
  if (input.source)
    attrs.source = input.source
  if (input.reason)
    attrs.reason = input.reason

  const fluxBalanceBucket = input.metadata?.flux_balance_bucket
  if (typeof fluxBalanceBucket === 'string')
    attrs.flux_balance_bucket = fluxBalanceBucket

  return attrs
}

/**
 * Creates AIRI's first-party product analytics event writer.
 *
 * Use when:
 * - Server-side product behavior has a user id and should be queryable by
 *   distinct users, funnels, or retention windows.
 * - Grafana needs low-cardinality event volume while Postgres keeps user-level
 *   detail.
 *
 * Expects:
 * - Callers pass only bounded `feature` / `action` / `status` values.
 * - PII, prompts, request ids, sessions, and user ids are not written into
 *   Prometheus labels. User id is stored only in the DB row.
 *
 * Returns:
 * - Best-effort event writer plus a DB aggregation helper for analytics jobs.
 */
export function createProductEventService(db: Database, metrics?: ProductMetrics | null, posthog?: PosthogSink | null) {
  return {
    async track(input: ProductEventInput): Promise<void> {
      // Postgres is the fact of record, so forwarding is gated both ways:
      // the DB write comes first (a PostHog outage can't lose the row) and
      // forwarding only runs when the row actually landed (a DB outage
      // can't mint PostHog events with no DB backing).
      let persisted = false
      try {
        await db.insert(schema.productEvents).values({
          userId: input.userId,
          feature: input.feature,
          action: input.action,
          status: input.status,
          source: input.source,
          model: input.model,
          provider: input.provider,
          reason: input.reason,
          metadata: input.metadata,
          createdAt: input.createdAt,
        })
        persisted = true

        metrics?.events.add(1, metricLabels(input))
      }
      catch (err) {
        logger.withError(err).withFields({
          userId: input.userId,
          feature: input.feature,
          action: input.action,
          status: input.status,
        }).warn('Failed to write product event; swallowing to protect caller')
      }

      // PostHog copy so browser funnels (identified by the same Better Auth
      // user id) get their server-side terminator events.
      const forwardedEvent = POSTHOG_FORWARDED_ACTIONS[input.action]
      if (persisted && posthog && forwardedEvent) {
        try {
          await posthog.capture({
            distinctId: input.userId,
            event: forwardedEvent,
            properties: {
              surface: 'server',
              feature: input.feature,
              status: input.status,
              ...(input.source && { source: input.source }),
              ...(input.reason && { reason: input.reason }),
              ...input.metadata,
            },
          })
        }
        catch (err) {
          // The sink contract already swallows transport errors; this guard
          // is the last line so a misbehaving sink can never fail the
          // webhook/auth flow that produced the business fact.
          logger.withError(err).withFields({ action: input.action }).warn('PostHog forwarding threw; product event already persisted')
        }
      }
    },

    async countDistinctUsersByFeature(input: ProductEventAggregateInput): Promise<ProductEventAggregateRow[]> {
      const where = input.to
        ? and(gte(schema.productEvents.createdAt, input.from), lt(schema.productEvents.createdAt, input.to))
        : gte(schema.productEvents.createdAt, input.from)

      const rows = await db
        .select({
          feature: schema.productEvents.feature,
          action: schema.productEvents.action,
          status: schema.productEvents.status,
          eventCount: count(),
          distinctUsers: sql<number>`count(distinct ${schema.productEvents.userId})::int`,
        })
        .from(schema.productEvents)
        .where(where)
        .groupBy(schema.productEvents.feature, schema.productEvents.action, schema.productEvents.status)
        .orderBy(asc(schema.productEvents.feature), asc(schema.productEvents.action), asc(schema.productEvents.status))

      return rows.map(row => ({
        feature: row.feature,
        action: row.action,
        status: row.status,
        eventCount: Number(row.eventCount),
        distinctUsers: Number(row.distinctUsers),
      }))
    },
  }
}

export type ProductEventService = ReturnType<typeof createProductEventService>
