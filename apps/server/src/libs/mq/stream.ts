import type {
  ClaimIdleOptions,
  ConsumeOptions,
  MqOptions,
  RedisArgument,
  RedisCommandClient,
  StreamMessage,
} from './types'

import { useLogger } from '@guiiai/logg'

type RedisStreamEntry = [streamMessageId: string, fieldValues: string[]]
type RedisReadGroupResponse = [stream: string, entries: RedisStreamEntry[]][]
type RedisAutoClaimResponse = [nextStartId: string, entries: RedisStreamEntry[], deletedIds?: string[]]

const logger = useLogger('mq-stream').useGlobalConfig()

/**
 * Create a typed Redis Stream service.
 *
 * The caller supplies serialize/deserialize functions so this module
 * stays domain-agnostic — it only knows how to talk to Redis Streams.
 */
export function createMqService<TEvent>(redis: RedisCommandClient, options: MqOptions<TEvent>) {
  const { stream, serialize, deserialize } = options

  function parseEntry(entry: unknown): StreamMessage<TEvent> {
    if (!Array.isArray(entry) || entry.length !== 2) {
      throw new Error('Redis Stream entry has an invalid shape')
    }

    const [streamMessageId, rawFieldValues] = entry
    if (typeof streamMessageId !== 'string') {
      throw new TypeError('Redis Stream entry is missing a valid message id')
    }

    if (!Array.isArray(rawFieldValues)) {
      throw new TypeError('Redis Stream entry fields are invalid')
    }

    return { streamMessageId, event: deserialize(toFieldRecord(rawFieldValues)) }
  }

  function parseReadGroupResponse(response: unknown): StreamMessage<TEvent>[] {
    if (response == null) {
      return []
    }

    if (!Array.isArray(response)) {
      throw new TypeError('Redis XREADGROUP returned an invalid response')
    }

    return response.flatMap((streamResponse) => {
      if (!Array.isArray(streamResponse) || streamResponse.length !== 2) {
        throw new Error('Redis XREADGROUP returned an invalid stream payload')
      }

      const [, entries] = streamResponse as RedisReadGroupResponse[number]
      return entries.map(parseEntry)
    })
  }

  function parseAutoClaimResponse(response: unknown): StreamMessage<TEvent>[] {
    if (response == null) {
      return []
    }

    if (!Array.isArray(response) || response.length < 2) {
      throw new Error('Redis XAUTOCLAIM returned an invalid response')
    }

    const [, entries] = response as RedisAutoClaimResponse
    if (!Array.isArray(entries)) {
      throw new TypeError('Redis XAUTOCLAIM returned invalid entries')
    }

    return entries.map(parseEntry)
  }

  return {
    stream,

    async publish(event: TEvent): Promise<string> {
      const fields = serialize(event)
      const xaddArgs: RedisArgument[] = [stream]

      if (options.maxLength != null) {
        xaddArgs.push('MAXLEN', '~', options.maxLength)
      }

      xaddArgs.push('*', ...toRedisFieldArguments(fields))

      const streamMessageId = await redis.call('XADD', ...xaddArgs)
      if (typeof streamMessageId !== 'string') {
        throw new TypeError('Redis XADD did not return a stream message id')
      }

      logger.withFields({ stream, streamMessageId }).log('Published event to Redis Stream')
      return streamMessageId
    },

    async ensureConsumerGroup(group: string, startId = '0'): Promise<boolean> {
      try {
        await redis.call('XGROUP', 'CREATE', stream, group, startId, 'MKSTREAM')
        return true
      }
      catch (error) {
        if (error instanceof Error && error.message.includes('BUSYGROUP')) {
          return false
        }

        throw error
      }
    },

    async consume(consumeOptions: ConsumeOptions): Promise<StreamMessage<TEvent>[]> {
      const response = await redis.call(
        'XREADGROUP',
        'GROUP',
        consumeOptions.group,
        consumeOptions.consumer,
        'COUNT',
        consumeOptions.count ?? 10,
        'BLOCK',
        consumeOptions.blockMs ?? 5_000,
        'STREAMS',
        stream,
        consumeOptions.startId ?? '>',
      )

      return parseReadGroupResponse(response)
    },

    async claimIdleMessages(claimOptions: ClaimIdleOptions): Promise<StreamMessage<TEvent>[]> {
      const response = await redis.call(
        'XAUTOCLAIM',
        stream,
        claimOptions.group,
        claimOptions.consumer,
        claimOptions.minIdleTimeMs,
        claimOptions.startId ?? '0-0',
        'COUNT',
        claimOptions.count ?? 10,
      )

      return parseAutoClaimResponse(response)
    },

    async ack(group: string, streamMessageIds: string | string[]): Promise<number> {
      const ids = Array.isArray(streamMessageIds) ? streamMessageIds : [streamMessageIds]

      if (ids.length === 0) {
        return 0
      }

      const acked = await redis.call('XACK', stream, group, ...ids)
      if (typeof acked !== 'number') {
        throw new TypeError('Redis XACK did not return an acknowledgement count')
      }

      return acked
    },
  }
}

function toRedisFieldArguments(fields: Record<string, string | undefined>): RedisArgument[] {
  return Object.entries(fields)
    .filter(([, value]) => value !== undefined)
    .flatMap(([key, value]) => [key, value as string])
}

function toFieldRecord(fieldValues: string[]): Record<string, string> {
  if (fieldValues.length % 2 !== 0) {
    throw new Error('Redis Stream entry fields must be key/value pairs')
  }

  const fields: Record<string, string> = {}
  for (let index = 0; index < fieldValues.length; index += 2) {
    const key = fieldValues[index]
    const value = fieldValues[index + 1]

    if (typeof key !== 'string' || typeof value !== 'string') {
      throw new TypeError('Redis Stream entry contains non-string field data')
    }

    fields[key] = value
  }

  return fields
}

export type MqService<TEvent> = ReturnType<typeof createMqService<TEvent>>
