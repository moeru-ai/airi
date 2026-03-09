import type {
  PlannerCheckpoint,
  ShortTermMemoryRecord,
  ShortTermMemoryStore,
} from '@proj-airi/memory-alaya'
import type { Storage } from 'unstorage'

import { storage as defaultStorage } from '../storage'

const STM_CHECKPOINT_PREFIX = 'local:alaya/stm/checkpoint'
const STM_MEMORY_PREFIX = 'local:alaya/stm/memory'
const STM_IDEMPOTENCY_PREFIX = 'local:alaya/stm/idempotency'
const STM_SCHEMA_VERSION_KEY = 'local:alaya/stm/schema-version'
const LOCAL_MOUNT_PREFIX = 'local:'
const INDEXED_DB_BASE_PREFIX = 'airi-local:'

function checkpointKey(workspaceId: string) {
  return `${STM_CHECKPOINT_PREFIX}/${workspaceId}`
}

function memoryKey(workspaceId: string, memoryId: string) {
  return `${STM_MEMORY_PREFIX}/${workspaceId}/${memoryId}`
}

function idempotencyKey(workspaceId: string, key: string) {
  return `${STM_IDEMPOTENCY_PREFIX}/${workspaceId}/${key}`
}

function memoryKeyPrefix(workspaceId: string) {
  return `${STM_MEMORY_PREFIX}/${workspaceId}`
}

function idempotencyKeyPrefix(workspaceId: string) {
  return `${STM_IDEMPOTENCY_PREFIX}/${workspaceId}`
}

function normalizeStorageLookupKey(key: string) {
  if (!key)
    return ''
  return key
    .split('?')[0]
    .replace(/[\\/]/g, ':')
    .replace(/:+/g, ':')
    .replace(/^:|:$/g, '')
}

function normalizeLocalStorageKey(key: string) {
  if (!key.startsWith(LOCAL_MOUNT_PREFIX))
    return normalizeStorageLookupKey(key)

  const relativeKey = key.slice(LOCAL_MOUNT_PREFIX.length)
  if (!relativeKey.startsWith(INDEXED_DB_BASE_PREFIX))
    return normalizeStorageLookupKey(key)

  return normalizeStorageLookupKey(
    `${LOCAL_MOUNT_PREFIX}${relativeKey.slice(INDEXED_DB_BASE_PREFIX.length)}`,
  )
}

function normalizePrefixForChildren(prefix: string) {
  const normalized = normalizeStorageLookupKey(prefix)
  return normalized.endsWith(':')
    ? normalized
    : `${normalized}:`
}

async function listKeysByPrefix(storage: Storage, prefix: string) {
  const normalizedPrefix = normalizePrefixForChildren(prefix)
  const [scopedKeys, allLocalKeys] = await Promise.all([
    storage.getKeys(prefix),
    storage.getKeys(LOCAL_MOUNT_PREFIX),
  ])

  const normalized = [...scopedKeys, ...allLocalKeys]
    .map(normalizeLocalStorageKey)
    .filter(key => key.startsWith(normalizedPrefix))

  return [...new Set(normalized)]
}

export interface AlayaShortTermMemoryRepo extends ShortTermMemoryStore {
  listByWorkspace: (workspaceId: string) => Promise<ShortTermMemoryRecord[]>
  deleteMemory: (workspaceId: string, memoryId: string) => Promise<boolean>
  clearWorkspace: (workspaceId: string) => Promise<number>
  markAccessed: (input: { workspaceId: string, memoryIds: string[], accessedAt: number }) => Promise<number>
  ensureSchemaVersion: (schemaVersion: string) => Promise<{ reset: boolean, previousVersion?: string }>
}

export function createAlayaShortTermMemoryRepo(
  deps: {
    storage?: Storage
  } = {},
): AlayaShortTermMemoryRepo {
  const storage = deps.storage ?? defaultStorage

  return {
    async getCheckpoint(workspaceId: string) {
      const checkpoint = await storage.getItemRaw<PlannerCheckpoint>(checkpointKey(workspaceId))
      return checkpoint ?? undefined
    },

    async saveCheckpoint(checkpoint: PlannerCheckpoint) {
      await storage.setItemRaw(checkpointKey(checkpoint.workspaceId), checkpoint)
    },

    async ensureSchemaVersion(schemaVersion: string) {
      const normalizedSchemaVersion = schemaVersion.trim()
      const previousVersion = await storage.getItemRaw<string>(STM_SCHEMA_VERSION_KEY) ?? undefined
      if (previousVersion === normalizedSchemaVersion) {
        return {
          reset: false,
          previousVersion,
        }
      }

      const [memoryKeys, checkpointKeys, idempotencyKeys] = await Promise.all([
        listKeysByPrefix(storage, `${STM_MEMORY_PREFIX}/`),
        listKeysByPrefix(storage, `${STM_CHECKPOINT_PREFIX}/`),
        listKeysByPrefix(storage, `${STM_IDEMPOTENCY_PREFIX}/`),
      ])
      const hadExistingData = memoryKeys.length > 0 || checkpointKeys.length > 0 || idempotencyKeys.length > 0

      await Promise.all([
        ...memoryKeys.map(key => storage.removeItem(key)),
        ...checkpointKeys.map(key => storage.removeItem(key)),
        ...idempotencyKeys.map(key => storage.removeItem(key)),
      ])

      await storage.setItemRaw(STM_SCHEMA_VERSION_KEY, normalizedSchemaVersion)

      return {
        reset: hadExistingData,
        previousVersion,
      }
    },

    async upsert(records: ShortTermMemoryRecord[], options: { runId: string }) {
      let inserted = 0
      let merged = 0
      let skipped = 0
      const now = Date.now()

      for (const record of records) {
        const targetIdempotencyKey = idempotencyKey(record.workspaceId, record.idempotencyKey)
        const existingMemoryId = await storage.getItemRaw<string>(targetIdempotencyKey)
        const nextMetadata = {
          ...record.metadata,
          plannerRunId: options.runId,
        }

        if (!existingMemoryId) {
          await storage.setItemRaw(memoryKey(record.workspaceId, record.memoryId), {
            ...record,
            metadata: nextMetadata,
            updatedAt: now,
          })
          await storage.setItemRaw(targetIdempotencyKey, record.memoryId)
          inserted += 1
          continue
        }

        const existingMemory = await storage.getItemRaw<ShortTermMemoryRecord>(
          memoryKey(record.workspaceId, existingMemoryId),
        )

        if (!existingMemory) {
          await storage.setItemRaw(memoryKey(record.workspaceId, record.memoryId), {
            ...record,
            metadata: nextMetadata,
            updatedAt: now,
          })
          await storage.setItemRaw(targetIdempotencyKey, record.memoryId)
          inserted += 1
          continue
        }

        if (
          existingMemory.contentHash === record.contentHash
          && existingMemory.summary === record.summary
        ) {
          skipped += 1
          continue
        }

        const nextRecord: ShortTermMemoryRecord = {
          ...existingMemory,
          ...record,
          memoryId: existingMemory.memoryId,
          createdAt: existingMemory.createdAt,
          updatedAt: now,
          metadata: {
            ...existingMemory.metadata,
            ...nextMetadata,
          },
        }
        await storage.setItemRaw(memoryKey(record.workspaceId, existingMemory.memoryId), nextRecord)
        merged += 1
      }

      return {
        inserted,
        merged,
        skipped,
      }
    },

    async listByWorkspace(workspaceId: string) {
      if (!workspaceId)
        return []

      const keys = await listKeysByPrefix(storage, `${memoryKeyPrefix(workspaceId)}/`)
      if (keys.length === 0)
        return []

      const records = await Promise.all(
        keys.map(async key => storage.getItemRaw<ShortTermMemoryRecord>(key)),
      )

      return records
        .filter((record): record is ShortTermMemoryRecord => !!record)
        .sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt))
    },

    async deleteMemory(workspaceId: string, memoryId: string) {
      if (!workspaceId || !memoryId)
        return false

      const targetMemoryKey = memoryKey(workspaceId, memoryId)
      const targetRecord = await storage.getItemRaw<ShortTermMemoryRecord>(targetMemoryKey)
      if (!targetRecord)
        return false

      await storage.removeItem(targetMemoryKey)

      if (targetRecord.idempotencyKey) {
        await storage.removeItem(idempotencyKey(workspaceId, targetRecord.idempotencyKey))
      }

      const idempotencyKeys = await listKeysByPrefix(storage, `${idempotencyKeyPrefix(workspaceId)}/`)
      for (const key of idempotencyKeys) {
        const mappedMemoryId = await storage.getItemRaw<string>(key)
        if (mappedMemoryId === memoryId) {
          await storage.removeItem(key)
        }
      }

      return true
    },

    async markAccessed(input) {
      if (!input.workspaceId || input.memoryIds.length === 0)
        return 0

      const uniqueMemoryIds = [...new Set(input.memoryIds.filter(Boolean))]
      let updated = 0

      for (const memoryId of uniqueMemoryIds) {
        const targetKey = memoryKey(input.workspaceId, memoryId)
        const targetRecord = await storage.getItemRaw<ShortTermMemoryRecord>(targetKey)
        if (!targetRecord)
          continue

        await storage.setItemRaw(targetKey, {
          ...targetRecord,
          lastAccessedAt: input.accessedAt,
          accessCount: (targetRecord.accessCount ?? 0) + 1,
        })
        updated += 1
      }

      return updated
    },

    async clearWorkspace(workspaceId: string) {
      if (!workspaceId)
        return 0

      const [memoryKeys, idempotencyKeys] = await Promise.all([
        listKeysByPrefix(storage, `${memoryKeyPrefix(workspaceId)}/`),
        listKeysByPrefix(storage, `${idempotencyKeyPrefix(workspaceId)}/`),
      ])

      await Promise.all([
        ...memoryKeys.map(key => storage.removeItem(key)),
        ...idempotencyKeys.map(key => storage.removeItem(key)),
      ])

      return memoryKeys.length
    },
  }
}

export const alayaShortTermMemoryRepo = createAlayaShortTermMemoryRepo()
