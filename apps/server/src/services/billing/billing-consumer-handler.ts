import type { Database } from '../../libs/db'
import type { StreamMessage } from '../../libs/mq'
import type { BillingEvent } from './billing-events'

import { useLogger } from '@guiiai/logg'

import * as fluxTxSchema from '../../schemas/flux-transaction'
import * as llmRequestLogSchema from '../../schemas/llm-request-log'

const logger = useLogger('billing-consumer-handler').useGlobalConfig()

export function createBillingConsumerHandler(db: Database) {
  return {
    async handleMessage(message: StreamMessage<BillingEvent>): Promise<void> {
      const { event } = message

      switch (event.eventType) {
        case 'flux.debited': {
          const balanceBefore = event.payload.balanceAfter != null
            ? event.payload.balanceAfter + event.payload.amount
            : 0

          // NOTICE: onConflictDoNothing handles redelivery after crash —
          // the unique index (userId, requestId) prevents duplicate transaction entries.
          await db.insert(fluxTxSchema.fluxTransaction).values({
            userId: event.userId,
            type: 'debit',
            amount: event.payload.amount,
            balanceBefore,
            balanceAfter: event.payload.balanceAfter ?? balanceBefore - event.payload.amount,
            requestId: event.requestId,
            description: event.payload.description ?? event.payload.source ?? 'LLM request',
            metadata: event.payload.metadata != null || event.payload.source != null
              ? {
                  ...(event.payload.metadata as Record<string, unknown>),
                  source: event.payload.source,
                }
              : undefined,
          }).onConflictDoNothing()

          logger.withFields({
            eventId: event.eventId,
            userId: event.userId,
            amount: event.payload.amount,
          }).log('Wrote debit transaction')
          break
        }

        case 'llm.request.log': {
          // NOTICE: Use eventId as PK to make redelivery idempotent.
          await db.insert(llmRequestLogSchema.llmRequestLog).values({
            id: event.eventId,
            userId: event.userId,
            model: event.payload.model,
            status: event.payload.status,
            durationMs: event.payload.durationMs,
            fluxConsumed: event.payload.fluxConsumed,
            promptTokens: event.payload.promptTokens,
            completionTokens: event.payload.completionTokens,
          }).onConflictDoNothing()

          logger.withFields({
            eventId: event.eventId,
            userId: event.userId,
            model: event.payload.model,
          }).log('Wrote LLM request log')
          break
        }

        case 'flux.credited':
        case 'stripe.checkout.completed':
        case 'llm.request.completed': {
          // These events are handled synchronously or not yet consumed.
          // Log for observability but no async DB writes needed.
          logger.withFields({
            eventId: event.eventId,
            eventType: event.eventType,
          }).log('Acknowledged event (no async action)')
          break
        }
      }
    },
  }
}

export type BillingConsumerHandler = ReturnType<typeof createBillingConsumerHandler>
