import type { ProductAnalyticsSink } from '../adapters/openpanel'

import { useLogger } from '@guiiai/logg'

const logger = useLogger('product-events')

const RESERVED_PRODUCT_METADATA_KEYS = new Set([
  'event_id',
  '__deviceId',
  '__identify',
  'profileId',
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

/** Product funnel fact forwarded to OpenPanel from the server. */
export interface ProductEventInput {
  /** Authenticated user id used for product attribution. Never emitted as a Prometheus label. */
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
  /** Stable source event id for reconciliation. Callers suppress replays before capture. */
  eventId?: string
}

/**
 * Server-side actions that anchor the product funnel. Per-request LLM
 * and TTS telemetry stays in operational systems and does not enter this path.
 *
 * `user_signed_up` maps to `signup_completed` because the identified server
 * hook is the canonical registration fact for every signup method. Anonymous
 * auth UI progress uses `signup_form_completed` and never reuses this name.
 */
const FORWARDED_ACTIONS: Partial<Record<ProductAction, string>> = {
  user_signed_up: 'signup_completed',
  checkout_started: 'checkout_created',
  payment_completed: 'payment_completed',
}

function stringMetadata(input: ProductEventInput, key: string): string | undefined {
  const value = input.metadata?.[key]
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function hasReservedMetadataKey(metadata: ProductEventMetadata | undefined): boolean {
  return metadata != null && Object.keys(metadata).some(key => RESERVED_PRODUCT_METADATA_KEYS.has(key))
}

/**
 * Sends confirmed product facts to OpenPanel.
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
export function createProductEventService(sink?: ProductAnalyticsSink | null) {
  return {
    async track(input: ProductEventInput): Promise<void> {
      const forwardedEvent = FORWARDED_ACTIONS[input.action]
      if (!sink || !forwardedEvent)
        return

      if (hasReservedMetadataKey(input.metadata)) {
        logger.withFields({ action: input.action }).warn('Rejected reserved product event metadata')
        return
      }

      const deviceId = stringMetadata(input, 'openpanel_device_id')

      try {
        await sink.capture({
          userId: input.userId,
          ...(deviceId && { deviceId }),
          event: forwardedEvent,
          properties: {
            ...input.metadata,
            ...(input.eventId && { event_id: input.eventId }),
            app_surface: 'server',
            airi_user_id: input.userId,
            feature: input.feature,
            status: input.status,
            ...(input.source && { source: input.source }),
          },
        })
      }
      catch (err) {
        logger.withError(err).withFields({ action: input.action }).warn('OpenPanel product analytics capture failed')
      }
    },
  }
}

export type ProductEventService = ReturnType<typeof createProductEventService>
