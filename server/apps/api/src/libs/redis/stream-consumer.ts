import type Redis from 'ioredis'
import type { InferOutput } from 'valibot'

import type { StreamDefinition, StreamEventDefinition } from './stream'

import { useLogger } from '@guiiai/logg'
import { array, integer, isoTimestamp, literal, minValue, nonEmpty, nullable, number, object, optional, parse, pipe, regex, safeParse, string, summarize, tuple, union } from 'valibot'

const logger = useLogger('redis-stream-consumer').useGlobalConfig()

/** Pause after a failed claim, read, ack, or dead-letter write, so a Redis outage does not spin the loop. */
const LOOP_RETRY_DELAY_MS = 1000

/**
 * Thrown by a handler when an entry can never succeed, for example when it names a record that
 * cannot exist. The consumer copies the entry to the dead-letter stream and acks it.
 * Any other handler error leaves the entry pending, so a later claim retries it.
 */
export class InvalidStreamEntryError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'InvalidStreamEntryError'
  }
}

/** One decoded entry. `payload` is the output of the payload schema of its type. */
export interface StreamEntry<TType extends string, TEvent extends StreamEventDefinition> {
  /** Redis stream entry ID, for example `1729300000000-0`. */
  streamEntryId: string
  /** Producer event ID. Handlers use it as the dedupe key, because a redelivery repeats it. */
  id: string
  type: TType
  version: number
  occurredAt: Date
  payload: InferOutput<TEvent['payload']>
}

/**
 * Handlers by event type. A type without a handler is logged and acked, like an unknown type.
 * A handler must be idempotent for `id`, because delivery is at least once.
 */
export type StreamHandlers<TEvents extends Record<string, StreamEventDefinition>> = {
  [TType in keyof TEvents & string]?: (entry: StreamEntry<TType, TEvents[TType]>) => Promise<void>
}

export interface StreamConsumerOptions {
  /** Consumer group. The consumer creates it at `$` with `MKSTREAM`, so it reads only entries added after the first start. */
  group: string
  /** Consumer name inside the group. Use a stable instance ID, so a restarted instance owns its old pending entries. */
  consumer: string
  /** Stream that receives a copy of each invalid entry with a `reason` field. */
  deadLetterKey: string
  /**
   * A reclaimed entry with more deliveries than this goes to the dead-letter stream.
   * @default 5
   */
  maxDeliveries?: number
  /**
   * A pending entry idle for this long is claimed by this consumer and retried.
   * @default 30000
   */
  claimMinIdleMs?: number
  /**
   * Longest wait of one XREADGROUP for new entries.
   * @default 5000
   */
  blockMs?: number
  /**
   * Entries per claim or read.
   * @default 10
   */
  count?: number
  /**
   * Approximate entry limit of the dead-letter stream.
   * @default 10000
   */
  deadLetterMaxLength?: number
}

const positiveIntegerSchema = pipe(number(), integer(), minValue(1))
const optionsSchema = object({
  group: pipe(string(), nonEmpty()),
  consumer: pipe(string(), nonEmpty()),
  deadLetterKey: pipe(string(), nonEmpty()),
  maxDeliveries: optional(positiveIntegerSchema, 5),
  claimMinIdleMs: optional(pipe(number(), integer(), minValue(0)), 30_000),
  blockMs: optional(positiveIntegerSchema, 5000),
  count: optional(positiveIntegerSchema, 10),
  deadLetterMaxLength: optional(positiveIntegerSchema, 10_000),
})

/** `[id, fields]`. Redis 6.2 returns null fields for a pending entry that MAXLEN already trimmed. */
const entryReplySchema = tuple([string(), nullable(array(string()))])
const readGroupReplySchema = nullable(array(tuple([string(), array(entryReplySchema)])))
/** `[next cursor, entries, deleted IDs]`. Redis 6.2 omits the deleted IDs. */
const autoClaimReplySchema = union([
  tuple([string(), array(entryReplySchema)]),
  tuple([string(), array(entryReplySchema), array(string())]),
])
/** `[[id, consumer, idle ms, delivery count]]` for one ID. */
const pendingReplySchema = array(tuple([string(), string(), number(), number()]))
const ackReplySchema = number()
const groupCreateReplySchema = literal('OK')

const envelopeSchema = object({
  id: pipe(string(), nonEmpty()),
  type: pipe(string(), nonEmpty()),
  version: pipe(string(), regex(/^[1-9]\d*$/)),
  occurredAt: pipe(string(), isoTimestamp()),
  payload: string(),
})

type EntryReply = InferOutput<typeof entryReplySchema>

/** An entry from a claim or a read. Only a claimed entry can have more than one delivery. */
interface Delivery {
  streamEntryId: string
  fields: string[] | null
  claimed: boolean
}

function fieldRecordFrom(fields: string[]): Record<string, string> {
  const record: Record<string, string> = {}
  for (let index = 0; index + 1 < fields.length; index += 2)
    record[fields[index]!] = fields[index + 1]!
  return record
}

/**
 * Creates the consumer of one stream for one group. It does not start until `start()`.
 *
 * Loop, per iteration:
 * 1. `XAUTOCLAIM` entries of the group that are idle for `claimMinIdleMs`, and check their
 *    delivery counts with `XPENDING`.
 * 2. When nothing is claimed, `XREADGROUP ... BLOCK blockMs ... >` on a dedicated connection,
 *    because a blocking read stops every other command on its connection.
 * 3. Decode and validate each entry with the stream definition, then call its handler.
 *
 * Outcomes:
 * - Handler success: `XACK`.
 * - Invalid envelope, invalid payload, {@link InvalidStreamEntryError}, or more than
 *   `maxDeliveries` deliveries: copy the fields with `reason` to `deadLetterKey`, then `XACK`.
 * - Unknown type, unknown version, or no handler: log a warning and `XACK`. A producer can deploy first.
 * - Any other handler error: no ack. The entry stays pending, and a later claim retries it.
 *
 * Lifecycle: `start()` creates the group, ignores `BUSYGROUP`, and starts the loop in the background.
 * `stop()` interrupts a blocking read, lets the current batch finish its acks, and closes the read
 * connection. An entry that the interrupted read already delivered stays pending and is claimed later.
 * Each instance starts at most one time. Register both with `lifecycle.appHooks`.
 *
 * No consumer runs in the API now. The API AGENTS.md has no background loops, so wiring one needs an ADR.
 */
export function createStreamConsumer<TEvents extends Record<string, StreamEventDefinition>>(
  redis: Redis,
  definition: StreamDefinition<TEvents>,
  handlers: StreamHandlers<TEvents>,
  options: StreamConsumerOptions,
) {
  const config = parse(optionsSchema, options)
  const fields = { stream: definition.key, group: config.group, consumer: config.consumer }

  let loop: Promise<void> | null = null
  let reader: Redis | null = null
  let stopping = false
  /** True while XREADGROUP blocks, so `stop()` knows that it must interrupt the read. */
  let reading = false
  let wakeRetryDelay: (() => void) | null = null

  async function ensureGroup(): Promise<void> {
    try {
      parse(groupCreateReplySchema, await redis.call('XGROUP', 'CREATE', definition.key, config.group, '$', 'MKSTREAM'))
    }
    catch (error) {
      // Another instance or an earlier start created the group. Its read position stays as it is.
      if (error instanceof Error && error.message.startsWith('BUSYGROUP'))
        return
      throw error
    }
  }

  let claimCursor = '0-0'
  async function claimIdle(): Promise<Delivery[]> {
    const reply = parse(autoClaimReplySchema, await redis.call(
      'XAUTOCLAIM',
      definition.key,
      config.group,
      config.consumer,
      config.claimMinIdleMs,
      claimCursor,
      'COUNT',
      config.count,
    ))
    // The cursor walks the pending list over iterations and returns to `0-0` at the end.
    // Redis 7 removes deleted IDs from the pending list itself, so they need no ack.
    claimCursor = reply[0]
    return reply[1].map(([streamEntryId, entryFields]) => ({ streamEntryId, fields: entryFields, claimed: true }))
  }

  async function readNew(connection: Redis): Promise<Delivery[]> {
    reading = true
    try {
      if (stopping)
        return []
      const reply = parse(readGroupReplySchema, await connection.call(
        'XREADGROUP',
        'GROUP',
        config.group,
        config.consumer,
        'COUNT',
        config.count,
        'BLOCK',
        config.blockMs,
        'STREAMS',
        definition.key,
        '>',
      ))
      return (reply ?? []).flatMap(([, entries]) => entries.map(([streamEntryId, entryFields]: EntryReply) => ({ streamEntryId, fields: entryFields, claimed: false })))
    }
    finally {
      reading = false
    }
  }

  async function deliveryCount(streamEntryId: string): Promise<number> {
    const [pending] = parse(pendingReplySchema, await redis.call('XPENDING', definition.key, config.group, streamEntryId, streamEntryId, 1))
    // An entry acked by another consumer after the claim has no pending record. Its count does not matter.
    return pending?.[3] ?? 0
  }

  async function ack(streamEntryId: string): Promise<void> {
    parse(ackReplySchema, await redis.call('XACK', definition.key, config.group, streamEntryId))
  }

  async function deadLetter(delivery: Delivery, reason: string): Promise<void> {
    // Write the copy before the ack. A crash between them repeats the copy, and never loses the entry.
    await redis.xadd(config.deadLetterKey, 'MAXLEN', '~', config.deadLetterMaxLength, '*', ...(delivery.fields ?? []), 'reason', reason)
    await ack(delivery.streamEntryId)
    logger.withFields({ ...fields, streamEntryId: delivery.streamEntryId, reason }).warn('Moved stream entry to the dead-letter stream')
  }

  async function ignore(delivery: Delivery, reason: string): Promise<void> {
    await ack(delivery.streamEntryId)
    logger.withFields({ ...fields, streamEntryId: delivery.streamEntryId, reason }).warn('Acked stream entry without a handler')
  }

  async function handle(delivery: Delivery): Promise<void> {
    if (delivery.fields === null) {
      // MAXLEN trimmed the entry while it was pending (Redis 6.2 reply). Nothing is left to handle.
      await ack(delivery.streamEntryId)
      return
    }

    if (delivery.claimed) {
      const deliveries = await deliveryCount(delivery.streamEntryId)
      if (deliveries > config.maxDeliveries)
        return deadLetter(delivery, `delivered ${deliveries} times, more than ${config.maxDeliveries}`)
    }

    const envelope = safeParse(envelopeSchema, fieldRecordFrom(delivery.fields))
    if (!envelope.success)
      return deadLetter(delivery, `invalid envelope: ${summarize(envelope.issues)}`)

    const { id, type, version, occurredAt, payload: rawPayload } = envelope.output
    const eventDefinition = Object.hasOwn(definition.events, type) ? definition.events[type] : undefined
    if (!eventDefinition)
      return ignore(delivery, `unknown type ${type}`)
    if (version !== String(eventDefinition.version))
      return ignore(delivery, `unknown version ${version} of ${type}`)
    const handler = handlers[type as keyof TEvents & string]
    if (!handler)
      return ignore(delivery, `no handler for ${type}`)

    let json: unknown
    try {
      json = JSON.parse(rawPayload)
    }
    catch {
      return deadLetter(delivery, 'payload is not JSON')
    }
    const payload = safeParse(eventDefinition.payload, json)
    if (!payload.success)
      return deadLetter(delivery, `invalid payload: ${summarize(payload.issues)}`)

    try {
      await handler({
        streamEntryId: delivery.streamEntryId,
        id,
        type,
        version: Number(version),
        occurredAt: new Date(occurredAt),
        payload: payload.output,
      })
    }
    catch (error) {
      if (error instanceof InvalidStreamEntryError)
        return deadLetter(delivery, error.message)
      logger.withError(error).withFields({ ...fields, streamEntryId: delivery.streamEntryId, id, type }).error('Stream handler failed; leaving the entry pending')
      return
    }
    await ack(delivery.streamEntryId)
  }

  async function waitBeforeRetry(): Promise<void> {
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, LOOP_RETRY_DELAY_MS)
      wakeRetryDelay = () => {
        clearTimeout(timer)
        resolve()
      }
    })
    wakeRetryDelay = null
  }

  async function run(connection: Redis): Promise<void> {
    // `stop()` sets `stopping` from outside this loop.
    while (true) {
      if (stopping)
        return
      try {
        let batch = await claimIdle()
        if (batch.length === 0)
          batch = await readNew(connection)
        // Finish the whole batch, also during `stop()`, so a handled entry is acked before shutdown.
        for (const delivery of batch)
          await handle(delivery)
      }
      catch (error) {
        // `stop()` closes the read connection, so a rejected read during shutdown is expected.
        if (stopping)
          return
        logger.withError(error).withFields(fields).error('Stream consumer iteration failed; retrying')
        await waitBeforeRetry()
      }
    }
  }

  return {
    /** Creates the group and starts the loop. Rejects when the group cannot be created. */
    async start(): Promise<void> {
      if (loop || stopping)
        throw new Error(`Stream consumer ${config.consumer} for ${definition.key} already started`)
      await ensureGroup()
      reader = redis.duplicate()
      loop = run(reader)
      logger.withFields(fields).log('Started stream consumer')
    },

    /** Stops the loop after the current batch and closes the read connection. Safe to call before `start()`. */
    async stop(): Promise<void> {
      stopping = true
      wakeRetryDelay?.()
      if (reading)
        reader?.disconnect()
      await loop
      reader?.disconnect()
      if (loop)
        logger.withFields(fields).log('Stopped stream consumer')
    },
  }
}

export type StreamConsumer = ReturnType<typeof createStreamConsumer>
