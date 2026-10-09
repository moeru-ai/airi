import type { InferOutput } from 'valibot'

import type { ConfigKVService } from '../../services/adapters/config-kv'
import type { EvidenceReceipt } from '../../services/domain/payment'

import { array, nullable, object, optional, string } from 'valibot'

export const REVENUECAT_PROCESSOR = 'revenuecat' as const

const revenuecatEventSchema = object({
  type: string(),
  id: string(),
  app_user_id: optional(string()),
  product_id: optional(nullable(string())),
  transaction_id: optional(nullable(string())),
  environment: optional(nullable(string())),
  store: optional(nullable(string())),
  // TRANSFER names its users here and omits `app_user_id`.
  transferred_from: optional(array(string())),
  transferred_to: optional(array(string())),
})

const revenuecatWebhookSchema = object({
  api_version: string(),
  event: revenuecatEventSchema,
})

export type RevenuecatWebhook = InferOutput<typeof revenuecatWebhookSchema>
export type RevenuecatEvent = InferOutput<typeof revenuecatEventSchema>

/** Webhook event types that grant Flux. Consumables arrive as non-renewing purchases. */
export const FLUX_GRANT_EVENT = 'NON_RENEWING_PURCHASE'

export { revenuecatWebhookSchema }

export async function resolveRevenuecatPack(configKV: ConfigKVService, productId: string) {
  const packs = await configKV.getOptional('REVENUECAT_FLUX_PACKS')
  return packs?.[productId]
}

/** Maps a verified non-renewing purchase onto an evidence receipt. Caller resolves the pack and validates identifiers. */
export function evidenceReceiptFromEvent(
  event: Pick<RevenuecatEvent, 'id' | 'type' | 'app_user_id' | 'environment' | 'store'>,
  userId: string,
  pack: { fluxAmount: number },
  ids: { productId: string, transactionId: string },
): EvidenceReceipt {
  return {
    kind: 'evidence',
    processor: REVENUECAT_PROCESSOR,
    processorOrderId: ids.transactionId,
    userId,
    packKey: ids.productId,
    fluxAmount: pack.fluxAmount,
    customerId: event.app_user_id,
    extras: {
      eventId: event.id,
      eventType: event.type,
      productId: ids.productId,
      transactionId: ids.transactionId,
      environment: event.environment,
      store: event.store,
    },
  }
}
