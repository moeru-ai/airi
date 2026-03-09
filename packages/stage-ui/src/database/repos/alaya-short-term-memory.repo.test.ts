import type { ShortTermMemoryRecord } from '@proj-airi/memory-alaya'

import { describe, expect, it } from 'vitest'

import { alayaSchemaVersion } from '@proj-airi/memory-alaya'
import { createAlayaShortTermMemoryRepo } from './alaya-short-term-memory.repo'

function normalizeLookupKey(key: string) {
  if (!key)
    return ''
  return key
    .split('?')[0]
    .replace(/[\\/]/g, ':')
    .replace(/:+/g, ':')
    .replace(/^:|:$/g, '')
}

function createIndexedDbLikeStorage() {
  const values = new Map<string, unknown>()

  function toInternalKey(key: string) {
    return normalizeLookupKey(key)
  }

  function toGetKeysShape(key: string) {
    if (!key.startsWith('local:'))
      return key
    return `local:airi-local:${key.slice('local:'.length)}`
  }

  return {
    async getItemRaw<T>(key: string) {
      return (values.get(toInternalKey(key)) as T | undefined) ?? null
    },

    async setItemRaw(key: string, value: unknown) {
      values.set(toInternalKey(key), value)
    },

    async removeItem(key: string) {
      values.delete(toInternalKey(key))
    },

    async getKeys(base?: string) {
      const normalizedBase = normalizeLookupKey(base ?? '')
      const keys = [...values.keys()].map(toGetKeysShape)

      if (!normalizedBase)
        return keys

      return keys.filter(key => normalizeLookupKey(key).startsWith(normalizedBase))
    },
  }
}

function makeRecord(input: {
  workspaceId: string
  memoryId: string
  idempotencyKey: string
  createdAt: number
}): ShortTermMemoryRecord {
  return {
    memoryId: input.memoryId,
    workspaceId: input.workspaceId,
    sessionId: input.workspaceId,
    conversationId: input.workspaceId,
    summary: `summary-${input.memoryId}`,
    category: 'fact',
    tags: ['key_episode'],
    importance: 7,
    durability: 0.72,
    emotionIntensity: 0,
    retentionReason: 'key_event',
    sourceRefs: [{
      conversationId: input.workspaceId,
      turnId: `turn-${input.memoryId}`,
      eventAt: input.createdAt,
    }],
    embedding: {
      status: 'pending',
    },
    retention: {
      status: 'active',
    },
    decay: {
      halfLifeDays: 30,
      reinforcedCount: 0,
    },
    eventAt: input.createdAt,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
    lastAccessedAt: input.createdAt,
    accessCount: 0,
    idempotencyKey: input.idempotencyKey,
    contentHash: `hash-${input.memoryId}`,
    metadata: {},
  }
}

describe('alaya short-term memory repo', () => {
  it('lists workspace records from local:airi-local:* key shape', async () => {
    const repo = createAlayaShortTermMemoryRepo({
      storage: createIndexedDbLikeStorage() as never,
    })
    const now = Date.now()
    const record = makeRecord({
      workspaceId: 'workspace-a',
      memoryId: 'memory-a',
      idempotencyKey: 'idem-a',
      createdAt: now,
    })

    await repo.upsert([record], { runId: 'run-a' })
    const records = await repo.listByWorkspace('workspace-a')

    expect(records).toHaveLength(1)
    expect(records[0].memoryId).toBe('memory-a')
    expect(records[0].metadata.plannerRunId).toBe('run-a')
  })

  it('clears only the target workspace records', async () => {
    const repo = createAlayaShortTermMemoryRepo({
      storage: createIndexedDbLikeStorage() as never,
    })
    const now = Date.now()
    await repo.upsert(
      [
        makeRecord({
          workspaceId: 'workspace-a',
          memoryId: 'memory-a1',
          idempotencyKey: 'idem-a1',
          createdAt: now,
        }),
        makeRecord({
          workspaceId: 'workspace-a',
          memoryId: 'memory-a2',
          idempotencyKey: 'idem-a2',
          createdAt: now + 1,
        }),
        makeRecord({
          workspaceId: 'workspace-b',
          memoryId: 'memory-b1',
          idempotencyKey: 'idem-b1',
          createdAt: now + 2,
        }),
      ],
      { runId: 'run-b' },
    )

    const removed = await repo.clearWorkspace('workspace-a')

    expect(removed).toBe(2)
    expect(await repo.listByWorkspace('workspace-a')).toHaveLength(0)
    expect(await repo.listByWorkspace('workspace-b')).toHaveLength(1)
  })

  it('preserves embedding vectors when reading records back', async () => {
    const repo = createAlayaShortTermMemoryRepo({
      storage: createIndexedDbLikeStorage() as never,
    })
    const now = Date.now()
    const record = makeRecord({
      workspaceId: 'workspace-vec',
      memoryId: 'memory-vec-1',
      idempotencyKey: 'idem-vec-1',
      createdAt: now,
    })
    record.embedding = {
      status: 'ready',
      model: 'text-embedding-3-small',
      dimension: 4,
      vector: [0.01, 0.02, 0.03, 0.04],
      generatedAt: now,
    }

    await repo.upsert([record], { runId: 'run-vec-1' })
    const records = await repo.listByWorkspace('workspace-vec')

    expect(records).toHaveLength(1)
    expect(records[0].embedding.status).toBe('ready')
    expect(records[0].embedding.model).toBe('text-embedding-3-small')
    expect(records[0].embedding.dimension).toBe(4)
    expect(records[0].embedding.vector).toEqual([0.01, 0.02, 0.03, 0.04])
  })

  it('updates lastAccessedAt and accessCount when recalled memories are marked accessed', async () => {
    const repo = createAlayaShortTermMemoryRepo({
      storage: createIndexedDbLikeStorage() as never,
    })
    const now = Date.now()
    await repo.upsert([
      makeRecord({
        workspaceId: 'workspace-access',
        memoryId: 'memory-access-1',
        idempotencyKey: 'idem-access-1',
        createdAt: now,
      }),
    ], { runId: 'run-access-1' })

    const updated = await repo.markAccessed({
      workspaceId: 'workspace-access',
      memoryIds: ['memory-access-1', 'memory-access-1'],
      accessedAt: now + 500,
    })
    const records = await repo.listByWorkspace('workspace-access')

    expect(updated).toBe(1)
    expect(records[0]?.lastAccessedAt).toBe(now + 500)
    expect(records[0]?.accessCount).toBe(1)
  })

  it('resets stored workspace memory when schema version changes', async () => {
    const repo = createAlayaShortTermMemoryRepo({
      storage: createIndexedDbLikeStorage() as never,
    })
    const now = Date.now()

    await repo.ensureSchemaVersion('legacy-v1')
    await repo.upsert([
      makeRecord({
        workspaceId: 'workspace-schema',
        memoryId: 'memory-schema-1',
        idempotencyKey: 'idem-schema-1',
        createdAt: now,
      }),
    ], { runId: 'run-schema-1' })

    const result = await repo.ensureSchemaVersion(alayaSchemaVersion)

    expect(result.reset).toBe(true)
    expect(result.previousVersion).toBe('legacy-v1')
    expect(await repo.listByWorkspace('workspace-schema')).toHaveLength(0)
  })
})
