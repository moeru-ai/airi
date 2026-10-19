import type { Buffer } from 'node:buffer'

import type Redis from 'ioredis'

import { createTestRedis } from './redis'

interface PendingEntry {
  consumer: string
  deliveredAt: number
  deliveries: number
}

interface GroupState {
  lastDeliveredId: string
  pending: Map<string, PendingEntry>
}

type Argument = string | number | Buffer

const POLL_INTERVAL_MS = 5

function compareIds(left: string, right: string): number {
  const [leftMs, leftSeq] = left.split('-').map(BigInt)
  const [rightMs, rightSeq] = right.split('-').map(BigInt)
  if (leftMs !== rightMs)
    return leftMs! < rightMs! ? -1 : 1
  if (leftSeq === rightSeq)
    return 0
  return leftSeq! < rightSeq! ? -1 : 1
}

function inRange(id: string, start: string, end: string): boolean {
  return (start === '-' || compareIds(id, start) >= 0) && (end === '+' || compareIds(id, end) <= 0)
}

/**
 * Creates an isolated in-memory Redis client that also answers the consumer group commands
 * `XGROUP CREATE`, `XREADGROUP`, `XAUTOCLAIM`, `XPENDING`, and `XACK` through `call()`.
 *
 * NOTICE:
 * ioredis-mock 8.13 implements XADD, XRANGE, and XREAD, but none of the consumer group commands
 * and no generic `call()`.
 * This helper keeps group state in memory and reads entries with the mock's XRANGE. It follows the
 * Redis 7 replies of these commands only as far as `libs/redis/stream-consumer.ts` uses them.
 * Source: node_modules/ioredis-mock/compat.md.
 * Removal condition: ioredis-mock implements these commands, or the tests use a real Redis.
 *
 * `duplicate()` shares the entries and the group state. `disconnect()` on a duplicate rejects
 * its blocked XREADGROUP with `Connection is closed.`, like ioredis does.
 */
export function createStreamGroupTestRedis(): Redis {
  const redis = createTestRedis()
  const groups = new Map<string, Map<string, GroupState>>()

  function groupOf(key: string, group: string): GroupState {
    const state = groups.get(key)?.get(group)
    if (!state)
      throw new Error(`NOGROUP No such key '${key}' or consumer group '${group}'`)
    return state
  }

  async function entriesOf(key: string): Promise<[string, string[]][]> {
    return await redis.xrange(key, '-', '+')
  }

  function install(client: Redis): Redis {
    let closed = false

    async function readGroup(args: string[]): Promise<unknown> {
      const [, group, consumer, , count, , blockMs, , key] = args as [string, string, string, string, string, string, string, string, string]
      const state = groupOf(key, group)
      const deadline = Date.now() + Number(blockMs)
      while (true) {
        if (closed)
          throw new Error('Connection is closed.')
        const fresh = (await entriesOf(key))
          .filter(([id]) => compareIds(id, state.lastDeliveredId) > 0)
          .slice(0, Number(count))
        if (fresh.length > 0) {
          for (const [id] of fresh)
            state.pending.set(id, { consumer, deliveredAt: Date.now(), deliveries: 1 })
          state.lastDeliveredId = fresh.at(-1)![0]
          return [[key, fresh]]
        }
        if (Date.now() >= deadline)
          return null
        await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS))
      }
    }

    async function autoClaim(args: string[]): Promise<unknown> {
      const [key, group, consumer, minIdleMs, start, , count] = args as [string, string, string, string, string, string, string]
      const state = groupOf(key, group)
      const entries = new Map(await entriesOf(key))
      const now = Date.now()
      const claimed: [string, string[]][] = []
      const deleted: string[] = []
      const candidates = [...state.pending.entries()]
        .filter(([id, pending]) => compareIds(id, start) >= 0 && now - pending.deliveredAt >= Number(minIdleMs))
        .sort(([left], [right]) => compareIds(left, right))
        .slice(0, Number(count))
      for (const [id, pending] of candidates) {
        const fields = entries.get(id)
        if (!fields) {
          state.pending.delete(id)
          deleted.push(id)
          continue
        }
        state.pending.set(id, { consumer, deliveredAt: now, deliveries: pending.deliveries + 1 })
        claimed.push([id, fields])
      }
      return ['0-0', claimed, deleted]
    }

    client.call = (async (command: string, ...rawArgs: Argument[]) => {
      const args = rawArgs.map(String)
      switch (command.toUpperCase()) {
        case 'XGROUP': {
          const [, key, group] = args as [string, string, string]
          const keyGroups = groups.get(key) ?? new Map<string, GroupState>()
          if (keyGroups.has(group))
            throw new Error('BUSYGROUP Consumer Group name already exists')
          const last = (await entriesOf(key)).at(-1)
          keyGroups.set(group, { lastDeliveredId: last?.[0] ?? '0-0', pending: new Map() })
          groups.set(key, keyGroups)
          return 'OK'
        }
        case 'XREADGROUP':
          return readGroup(args)
        case 'XAUTOCLAIM':
          return autoClaim(args)
        case 'XPENDING': {
          const [key, group, start, end, count] = args as [string, string, string, string, string]
          const now = Date.now()
          return [...groupOf(key, group).pending.entries()]
            .filter(([id]) => inRange(id, start, end))
            .sort(([left], [right]) => compareIds(left, right))
            .slice(0, Number(count))
            .map(([id, pending]) => [id, pending.consumer, now - pending.deliveredAt, pending.deliveries])
        }
        case 'XACK': {
          const [key, group, ...ids] = args as [string, string, ...string[]]
          const state = groupOf(key, group)
          return ids.filter(id => state.pending.delete(id)).length
        }
        default:
          throw new Error(`ERR unknown command '${command}' in the stream group test helper`)
      }
    }) as Redis['call']

    const originalDisconnect = client.disconnect.bind(client)
    client.disconnect = ((reconnect?: boolean) => {
      closed = true
      originalDisconnect(reconnect)
    }) as Redis['disconnect']

    const originalDuplicate = client.duplicate.bind(client)
    client.duplicate = ((...duplicateArgs: Parameters<Redis['duplicate']>) => install(originalDuplicate(...duplicateArgs))) as Redis['duplicate']
    return client
  }

  return install(redis)
}
