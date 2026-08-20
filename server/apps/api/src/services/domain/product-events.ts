import type { PosthogSink } from '../adapters/posthog'

import { createHash } from 'node:crypto'

import { useLogger } from '@guiiai/logg'

const logger = useLogger('product-events')

const RESERVED_POSTHOG_METADATA_KEYS = new Set([
  '$insert_id',
  '$session_id',
  'airi_user_id',
  'app_surface',
  'feature',
  'source',
  'status',
])

export type ProductFeature = 'auth' | 'billing'

export type ProductEventStatus = 'succeeded'

export type ProductEventMetadata = Record<string, string | number | boolean | null>

export type ProductAction
  = | 'user_signed_up'
    | 'checkout_started'
    | 'payment_completed'

/** Product funnel fact forwarded to PostHog from the server. */
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
  /** Optional primitive metadata for product analysis. Avoid PII and raw prompts. */
  metadata?: ProductEventMetadata
  /** Stable source event id used by PostHog for replay-safe deduplication. */
  eventId?: string
}

/** Product runtime where the user initiated the AI generation. */
export type AiGenerationAppSurface = 'web' | 'mobile' | 'electron'

/** Runtime that captured the `$ai_generation` fact. */
export type AiGenerationCaptureSurface = 'server' | 'client'

/** Explains whether `conversation_id` is an app conversation or a server fallback. */
export type AiGenerationConversationIdSource = 'client_header' | 'server_request'

/** Explains whether AIRI supplied a trustworthy USD cost for this generation. */
export type AiGenerationCostUsdSource = 'reported' | 'estimated' | 'unavailable'

/** Content-free PostHog AI generation fact keyed to the authenticated user. */
export interface AiGenerationEventInput {
  userId: string
  traceId: string
  generationId: string
  model: string
  provider: string
  providerType: 'official' | 'custom' | 'unknown'
  usageSource: 'reported' | 'estimated' | 'unavailable'
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
  totalCostUsd?: number
  costUsdSource?: AiGenerationCostUsdSource
  /** Always present for joins; `conversationIdSource` tells whether it is request-level fallback. */
  conversationId: string
  /** Distinguishes real client conversation ids from server-generated request fallbacks. */
  conversationIdSource: AiGenerationConversationIdSource
  roundId?: string
  /** Omitted when the server cannot determine the user's product runtime. */
  appSurface?: AiGenerationAppSurface
  /** Defaults to `server` because this service runs in the API process. */
  captureSurface?: AiGenerationCaptureSurface
  latencySeconds?: number
  stream?: boolean
}

/**
 * Server-side actions that anchor a PostHog product funnel. Per-request LLM
 * and TTS telemetry stays in operational systems and does not enter this path.
 *
 * `user_signed_up` maps to `signup_completed` because the identified server
 * hook is the canonical registration fact for every signup method. Anonymous
 * auth UI progress uses `signup_form_completed` and never reuses this name.
 */
const POSTHOG_FORWARDED_ACTIONS: Partial<Record<ProductAction, string>> = {
  user_signed_up: 'signup_completed',
  checkout_started: 'checkout_created',
  payment_completed: 'payment_completed',
}

function stringMetadata(input: ProductEventInput, key: string): string | undefined {
  const value = input.metadata?.[key]
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function posthogEventUuid(event: string, eventId: string): string {
  const digest = createHash('sha256').update(`airi:posthog:${event}:${eventId}`, 'utf8').digest()
  digest[6] = (digest[6] & 0x0F) | 0x50
  digest[8] = (digest[8] & 0x3F) | 0x80
  const hex = digest.subarray(0, 16).toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function hasReservedMetadataKey(metadata: ProductEventMetadata | undefined): boolean {
  return metadata != null && Object.keys(metadata).some(key => RESERVED_POSTHOG_METADATA_KEYS.has(key))
}

/**
 * Creates AIRI's server-side PostHog product analytics writer.
 *
 * Use when:
 * - A server has an authenticated user id and confirms a funnel fact.
 *
 * Expects:
 * - Callers pass only bounded `feature` / `action` / `status` values.
 * - Callers pass only the typed funnel actions in this module.
 *
 * Returns:
 * - A best-effort event writer. Capture errors never change the business flow.
 */
export function createProductEventService(posthog?: PosthogSink | null) {
  return {
    trackGeneration(input: AiGenerationEventInput): void {
      if (!posthog)
        return

      const event = {
        distinctId: input.userId,
        event: '$ai_generation',
        properties: {
          $ai_trace_id: input.traceId,
          $ai_session_id: input.conversationId,
          $ai_span_id: input.generationId,
          $ai_model: input.model,
          $ai_provider: input.provider,
          ...(input.inputTokens != null && { $ai_input_tokens: input.inputTokens }),
          ...(input.outputTokens != null && { $ai_output_tokens: input.outputTokens }),
          ...(input.totalTokens != null && { $ai_total_tokens: input.totalTokens }),
          ...(input.totalCostUsd != null && { $ai_total_cost_usd: input.totalCostUsd }),
          ...(input.latencySeconds != null && { $ai_latency: input.latencySeconds }),
          ...(input.stream != null && { $ai_stream: input.stream }),
          $insert_id: `ai-generation:${input.generationId}`,
          airi_user_id: input.userId,
          provider_type: input.providerType,
          usage_source: input.usageSource,
          token_usage_available: input.usageSource !== 'unavailable',
          cost_usd_source: input.costUsdSource ?? 'unavailable',
          cost_usd_known: input.totalCostUsd != null,
          conversation_id: input.conversationId,
          conversation_id_source: input.conversationIdSource,
          ...(input.roundId && { round_id: input.roundId }),
          ...(input.appSurface && { app_surface: input.appSurface }),
          capture_surface: input.captureSurface ?? 'server',
        },
      }

      if (posthog.captureQueued) {
        posthog.captureQueued(event)
        return
      }

      void posthog.capture(event)
        .catch(err => logger.withError(err).withFields({ generationId: input.generationId }).warn('Failed to capture PostHog AI generation'))
    },

    async track(input: ProductEventInput): Promise<void> {
      const forwardedEvent = POSTHOG_FORWARDED_ACTIONS[input.action]
      if (!posthog || !forwardedEvent)
        return

      if (hasReservedMetadataKey(input.metadata)) {
        logger.withFields({ action: input.action }).warn('Rejected reserved PostHog product event metadata')
        return
      }

      const posthogDistinctId = stringMetadata(input, 'posthog_distinct_id')
      const posthogSessionId = stringMetadata(input, 'posthog_session_id')
      if (posthogDistinctId && posthogDistinctId !== input.userId) {
        try {
          await posthog.capture({
            distinctId: input.userId,
            event: '$identify',
            properties: {
              ...(input.eventId && { $insert_id: input.eventId }),
              $anon_distinct_id: posthogDistinctId,
              airi_user_id: input.userId,
              ...(posthogSessionId && { $session_id: posthogSessionId }),
            },
            ...(input.eventId && { uuid: posthogEventUuid('$identify', input.eventId) }),
          })
        }
        catch (err) {
          logger.withError(err).withFields({ action: input.action }).warn('PostHog anonymous identity capture failed')
        }
      }

      try {
        await posthog.capture({
          distinctId: input.userId,
          event: forwardedEvent,
          properties: {
            ...input.metadata,
            ...(input.eventId && { $insert_id: input.eventId }),
            app_surface: 'server',
            airi_user_id: input.userId,
            ...(posthogDistinctId && { posthog_distinct_id: posthogDistinctId }),
            ...(posthogSessionId && { $session_id: posthogSessionId }),
            feature: input.feature,
            status: input.status,
            ...(input.source && { source: input.source }),
          },
          ...(input.eventId && { uuid: posthogEventUuid(forwardedEvent, input.eventId) }),
        })
      }
      catch (err) {
        logger.withError(err).withFields({ action: input.action }).warn('PostHog product analytics capture failed')
      }
    },
  }
}

export type ProductEventService = ReturnType<typeof createProductEventService>
