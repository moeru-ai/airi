import type { MemoryRecord, MemoryScope, MemorySearchHit, MemoryStore } from '../../types/memory'

import { storage } from '../storage'

// Flat record store keyed by id, plus a per-scope index of ids — mirrors the chat-sessions repo so
// listing/search never relies on prefix key scans. Both live in the `memory` IndexedDB namespace.
const recordKey = (id: string) => `memory:records/${id}`
const indexKey = (scope: MemoryScope) => `memory:index/${scope.userId}/${scope.character}`

async function readIndex(scope: MemoryScope): Promise<string[]> {
  return (await storage.getItemRaw<string[]>(indexKey(scope))) ?? []
}

async function writeIndex(scope: MemoryScope, ids: string[]): Promise<void> {
  await storage.setItemRaw(indexKey(scope), ids)
}

/**
 * Cosine similarity of two equal-length dense vectors.
 *
 * Returns 0 on a length mismatch or a zero-magnitude vector (no meaningful direction), so callers
 * never divide by zero or accidentally compare embeddings of different dimensions.
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0)
    return 0

  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB)
  return denom === 0 ? 0 : dot / denom
}

async function loadRecords(scope: MemoryScope): Promise<MemoryRecord[]> {
  const ids = await readIndex(scope)
  const records = await Promise.all(ids.map(id => storage.getItemRaw<MemoryRecord>(recordKey(id))))
  // Drop ids whose record is missing (e.g. an interrupted write) so list/search stay robust.
  return records.filter((record): record is MemoryRecord => record != null)
}

/**
 * IndexedDB-backed {@link MemoryStore} (via unstorage). Persistent across restarts and shared across
 * same-origin windows — the same properties the chat history relies on. Search is brute-force cosine
 * over a scope's records, which is sub-millisecond at the hundreds–thousands scale a companion
 * accumulates; a vector-indexed backend can replace it behind {@link MemoryStore} if that ever grows.
 */
export const memoryRepo: MemoryStore = {
  async insert(record) {
    await storage.setItemRaw(recordKey(record.id), record)
    const scope = { userId: record.userId, character: record.character }
    const ids = await readIndex(scope)
    if (!ids.includes(record.id)) {
      ids.push(record.id)
      await writeIndex(scope, ids)
    }
  },

  async get(scope, id) {
    const record = await storage.getItemRaw<MemoryRecord>(recordKey(id))
    // Guard against cross-scope id reuse: only return a record that belongs to the asked scope.
    if (!record || record.userId !== scope.userId || record.character !== scope.character)
      return null
    return record
  },

  async search(scope, query) {
    const records = await loadRecords(scope)
    const hits: MemorySearchHit[] = records
      .map(record => ({ record, similarity: cosineSimilarity(query.embedding, record.embedding) }))
      .filter(hit => query.minSimilarity == null || hit.similarity >= query.minSimilarity)
      .sort((a, b) => b.similarity - a.similarity)
    return hits.slice(0, Math.max(0, query.k))
  },

  async update(scope, id, patch) {
    const record = await this.get(scope, id)
    if (!record)
      return
    // Scope + id are immutable; everything else is patchable. updatedAt bumps unless explicitly set.
    const next: MemoryRecord = {
      ...record,
      ...patch,
      id: record.id,
      character: record.character,
      userId: record.userId,
      updatedAt: patch.updatedAt ?? Date.now(),
    }
    await storage.setItemRaw(recordKey(id), next)
  },

  async delete(scope, id) {
    await storage.removeItem(recordKey(id))
    const ids = await readIndex(scope)
    const next = ids.filter(existing => existing !== id)
    if (next.length !== ids.length)
      await writeIndex(scope, next)
  },

  async list(scope) {
    return loadRecords(scope)
  },

  async count(scope) {
    return (await readIndex(scope)).length
  },

  async clear(scope) {
    const ids = await readIndex(scope)
    await Promise.all(ids.map(id => storage.removeItem(recordKey(id))))
    await storage.removeItem(indexKey(scope))
  },
}
