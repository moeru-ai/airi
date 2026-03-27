import type { MqService } from './stream'
import type { StreamMessage, WorkerOptions } from './types'

import { useLogger } from '@guiiai/logg'

const logger = useLogger('mq-worker').useGlobalConfig()

/**
 * Create a consumer worker that processes messages from a Redis Stream.
 *
 * The loop first reclaims idle (possibly stalled) messages, then falls
 * back to consuming new ones. Each message is passed to `onMessage`;
 * on success it is acknowledged, on failure it stays pending for retry.
 */
export function createMqWorker<TEvent>(mq: MqService<TEvent>) {
  return {
    async run(options: WorkerOptions<TEvent>): Promise<void> {
      await mq.ensureConsumerGroup(options.group)

      while (!options.signal.aborted) {
        const reclaimedMessages = await mq.claimIdleMessages({
          group: options.group,
          consumer: options.consumer,
          minIdleTimeMs: options.minIdleTimeMs ?? 30_000,
          count: options.batchSize ?? 10,
        })

        const messages: StreamMessage<TEvent>[] = reclaimedMessages.length > 0
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
              streamMessageId: message.streamMessageId,
            }).error('MQ handler failed; leaving message pending')
          }
        }
      }
    },
  }
}

export type MqWorker<TEvent> = ReturnType<typeof createMqWorker<TEvent>>
