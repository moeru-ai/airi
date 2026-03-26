import type { BillingMqService } from './billing-mq'
import type { OutboxService } from './outbox-service'

import { useLogger } from '@guiiai/logg'

export interface RunOutboxDispatcherOptions {
  claimedBy: string
  signal: AbortSignal
  batchSize?: number
  claimTtlMs?: number
  pollIntervalMs?: number
}

const logger = useLogger('outbox-dispatcher').useGlobalConfig()

export function createOutboxDispatcher(outboxService: OutboxService, billingMqService: BillingMqService) {
  return {
    async dispatchBatch(claimedBy: string, batchSize: number, claimTtlMs: number): Promise<number> {
      const claimedEvents = await outboxService.claimPending({
        claimedBy,
        limit: batchSize,
        claimTtlMs,
      })

      for (const claimedEvent of claimedEvents) {
        try {
          const streamMessageId = await billingMqService.publish(claimedEvent.event)
          await outboxService.markPublished(claimedEvent.id, streamMessageId)
        }
        catch (error) {
          await outboxService.releaseClaim(claimedEvent.id)
          logger.withError(error).withFields({
            claimedBy,
            outboxId: claimedEvent.id,
            eventId: claimedEvent.event.eventId,
            eventType: claimedEvent.event.eventType,
          }).error('Failed to dispatch outbox event')
        }
      }

      return claimedEvents.length
    },

    async run(options: RunOutboxDispatcherOptions): Promise<void> {
      while (!options.signal.aborted) {
        const dispatchedCount = await this.dispatchBatch(
          options.claimedBy,
          options.batchSize ?? 10,
          options.claimTtlMs ?? 30_000,
        )

        if (dispatchedCount > 0) {
          continue
        }

        await sleep(options.pollIntervalMs ?? 1_000, options.signal)
      }
    },
  }
}

async function sleep(timeoutMs: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) {
    return
  }

  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, timeoutMs)

    const onAbort = () => {
      clearTimeout(timeout)
      signal.removeEventListener('abort', onAbort)
      resolve()
    }

    signal.addEventListener('abort', onAbort, { once: true })
  })
}

export type OutboxDispatcher = ReturnType<typeof createOutboxDispatcher>
