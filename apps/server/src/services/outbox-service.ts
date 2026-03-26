import type { Database } from '../libs/db'
import type { BillingEvent } from './billing-events'

import { and, asc, eq, inArray, isNull, lte, or } from 'drizzle-orm'

import { outboxEvents } from '../schemas/outbox-events'
import { parseBillingEvent, serializeBillingEvent } from './billing-events'

interface OutboxWriter {
  insert: Database['insert']
}

export interface ClaimOutboxEventsOptions {
  claimedBy: string
  limit: number
  claimTtlMs: number
}

export interface ClaimedOutboxEvent {
  id: string
  event: BillingEvent
}

export function createOutboxService(db: Database) {
  return {
    async enqueue(writer: OutboxWriter, event: BillingEvent): Promise<void> {
      const serializedEvent = serializeBillingEvent(event)
      await writer.insert(outboxEvents).values({
        eventId: serializedEvent.event_id,
        eventType: serializedEvent.event_type,
        aggregateId: serializedEvent.aggregate_id,
        userId: serializedEvent.user_id,
        requestId: serializedEvent.request_id,
        schemaVersion: Number(serializedEvent.schema_version),
        payload: serializedEvent.payload,
        occurredAt: new Date(serializedEvent.occurred_at),
      })
    },

    async claimPending(options: ClaimOutboxEventsOptions): Promise<ClaimedOutboxEvent[]> {
      const now = new Date()
      const claimExpiresAt = new Date(now.getTime() + options.claimTtlMs)

      return db.transaction(async (tx) => {
        const claimable = tx.$with('claimable').as(
          tx
            .select({ id: outboxEvents.id })
            .from(outboxEvents)
            .where(and(
              isNull(outboxEvents.publishedAt),
              lte(outboxEvents.availableAt, now),
              or(
                isNull(outboxEvents.claimExpiresAt),
                lte(outboxEvents.claimExpiresAt, now),
              ),
            ))
            .orderBy(asc(outboxEvents.createdAt))
            .limit(options.limit)
            .for('update', { skipLocked: true }),
        )

        const claimedRows = await tx
          .with(claimable)
          .update(outboxEvents)
          .set({
            claimedBy: options.claimedBy,
            claimExpiresAt,
            updatedAt: now,
          })
          .where(inArray(outboxEvents.id, tx.select({ id: claimable.id }).from(claimable)))
          .returning({
            id: outboxEvents.id,
            eventId: outboxEvents.eventId,
            eventType: outboxEvents.eventType,
            aggregateId: outboxEvents.aggregateId,
            userId: outboxEvents.userId,
            requestId: outboxEvents.requestId,
            schemaVersion: outboxEvents.schemaVersion,
            payload: outboxEvents.payload,
            occurredAt: outboxEvents.occurredAt,
          })

        return claimedRows.map(row => ({
          id: row.id,
          event: parseBillingEvent({
            event_id: row.eventId,
            event_type: row.eventType,
            aggregate_id: row.aggregateId,
            user_id: row.userId,
            request_id: row.requestId ?? undefined,
            schema_version: String(row.schemaVersion),
            payload: row.payload,
            occurred_at: row.occurredAt.toISOString(),
          }),
        }))
      })
    },

    async markPublished(id: string, streamMessageId: string): Promise<void> {
      await db.update(outboxEvents)
        .set({
          publishedAt: new Date(),
          streamMessageId,
          claimedBy: null,
          claimExpiresAt: null,
          updatedAt: new Date(),
        })
        .where(eq(outboxEvents.id, id))
    },

    async releaseClaim(id: string): Promise<void> {
      await db.update(outboxEvents)
        .set({
          claimedBy: null,
          claimExpiresAt: null,
          updatedAt: new Date(),
        })
        .where(eq(outboxEvents.id, id))
    },
  }
}

export type OutboxService = ReturnType<typeof createOutboxService>
