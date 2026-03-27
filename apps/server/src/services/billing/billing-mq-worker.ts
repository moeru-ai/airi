import type { BillingMqService, BillingStreamMessage } from './billing-mq'

import { useLogger } from '@guiiai/logg'

export interface RunBillingMqWorkerOptions {
  group: string
  consumer: string
  signal: AbortSignal
  batchSize?: number
  blockMs?: number
  minIdleTimeMs?: number
  onMessage: (message: BillingStreamMessage) => Promise<void>
}

const logger = useLogger('billing-mq-worker').useGlobalConfig()

export function createBillingMqWorker(mq: BillingMqService) {
  return {
    async run(options: RunBillingMqWorkerOptions): Promise<void> {
      await mq.ensureConsumerGroup(options.group)

      while (!options.signal.aborted) {
        const reclaimedMessages = await mq.claimIdleMessages({
          group: options.group,
          consumer: options.consumer,
          minIdleTimeMs: options.minIdleTimeMs ?? 30_000,
          count: options.batchSize ?? 10,
        })

        const messages = reclaimedMessages.length > 0
          ? reclaimedMessages
          : await mq.consume({
              group: options.group,
              consumer: options.consumer,
              count: options.batchSize ?? 10,
              blockMs: options.blockMs ?? 5_000,
            })

        if (messages.length === 0) {
          continue
        }

        for (const message of messages) {
          try {
            await options.onMessage(message)
            await mq.ack(options.group, message.streamMessageId)
          }
          catch (error) {
            logger.withError(error).withFields({
              group: options.group,
              consumer: options.consumer,
              eventId: message.event.eventId,
              streamMessageId: message.streamMessageId,
            }).error('Billing MQ handler failed; leaving message pending')
          }
        }
      }
    },
  }
}

export type BillingMqWorker = ReturnType<typeof createBillingMqWorker>
