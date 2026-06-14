import type { MemoryEntry, MemoryInput } from './types'

import { storage } from '../../storage'

/**
 * Low-level persistence layer for Alaya memory entries.
 *
 * Each character's memories are stored as a flat array under a single
 * IndexedDB key (`local:alaya/{userId}/memories/{characterId}`). This
 * keeps read/write operations on the same character atomic.
 *
 * ## Concurrency model
 *
 * IndexedDB via unstorage does NOT provide transactional guarantees
 * across separate read/write calls. To mitigate lost-write races for a
 * single character, we use a per-{userId,characterId} in-memory mutex.
 *
 * This protects against races within a single browser tab/worker.
 * Cross-tab race conditions are intentionally NOT handled in v1.
 *
 * Mirrors the repo pattern established in `chat-sessions.repo.ts`.
 */

// ------------------------------------------------------------------
// Key helpers
// ------------------------------------------------------------------

function scope(userId: string, characterId: string): string {
  return `local:alaya/${userId}/memories/${characterId}`
}

function countKey(userId: string, characterId: string): string {
  return `local:alaya/${userId}/memories/${characterId}::count`
}

// ------------------------------------------------------------------
// Per-character write lock
// ------------------------------------------------------------------

const locks = new Map<string, Promise<void>>()

function withLock<T>(userId: string, characterId: string, fn: () => Promise<T>): Promise<T> {
  const lockKey = `${userId}::${characterId}`
  const prev = locks.get(lockKey) ?? Promise.resolve()

  const next = prev.then(fn, fn) // run even if previous rejected

  // Create a marker that resolves (to void) when `next` settles.
  // The next caller chains onto this marker so writes are serialised
  // even if the underlying fn rejects.
  const marker = next.then(() => {}, () => {})
  locks.set(lockKey, marker)

  // Fire-and-forget cleanup: delete the entry only when it still
  // points to OUR marker.  If a subsequent lock has already replaced
  // it, we leave the Map untouched so that lock's caller can chain.
  const cleanup = () => {
    if (locks.get(lockKey) === marker)
      locks.delete(lockKey)
  }
  void next.then(cleanup, cleanup)

  return next
}

// ------------------------------------------------------------------
// CRUD
// ------------------------------------------------------------------

async function getAll(userId: string, characterId: string): Promise<MemoryEntry[]> {
  const stored = await storage.getItemRaw<MemoryEntry[]>(scope(userId, characterId))
  return stored ?? []
}

async function saveAll(userId: string, characterId: string, entries: MemoryEntry[]): Promise<void> {
  // Write both keys in parallel. If one fails the error propagates;
  // healCount() serves as the recovery path for count drift.
  await Promise.all([
    storage.setItemRaw(scope(userId, characterId), entries),
    storage.setItemRaw(countKey(userId, characterId), entries.length),
  ])
}

async function create(input: MemoryInput, userId: string, presetScore?: { importance?: number, recency?: number }): Promise<MemoryEntry> {
  return withLock(userId, input.characterId, async () => {
    const now = Date.now()

    const entry: MemoryEntry = {
      id: crypto.randomUUID(),
      characterId: input.characterId,
      content: input.content,
      importance: presetScore?.importance ?? 0.5,
      recency: presetScore?.recency ?? 1.0,
      source: input.source ?? 'chat',
      type: input.type,
      tags: input.tags ?? [],
      createdAt: now,
      updatedAt: now,
      lastAccessedAt: now,
      accessCount: 0,
    }

    const all = await getAll(userId, input.characterId)
    all.push(entry)
    await saveAll(userId, input.characterId, all)

    return entry
  })
}

async function update(
  userId: string,
  entry: MemoryEntry,
  patch: Partial<Pick<MemoryEntry, 'content' | 'importance' | 'recency' | 'tags' | 'summary' | 'lastAccessedAt' | 'accessCount' | 'type'>>,
): Promise<MemoryEntry> {
  return withLock(userId, entry.characterId, async () => {
    const all = await getAll(userId, entry.characterId)
    const index = all.findIndex(e => e.id === entry.id)

    if (index === -1) {
      throw new Error(`Memory entry ${entry.id} not found for character ${entry.characterId}`)
    }

    // Merge over the current stored record (all[index]), not the stale
    // `entry` argument which may be a lock-external snapshot.
    const updated: MemoryEntry = {
      ...all[index],
      ...patch,
      updatedAt: Date.now(),
    }

    all[index] = updated
    await saveAll(userId, entry.characterId, all)

    return updated
  })
}

async function remove(userId: string, characterId: string, entryId: string): Promise<void> {
  return withLock(userId, characterId, async () => {
    const all = await getAll(userId, characterId)
    const next = all.filter(e => e.id !== entryId)

    if (next.length === all.length) {
      return // nothing to remove
    }

    await saveAll(userId, characterId, next)
  })
}

async function bulkCreate(inputs: MemoryInput[], userId: string): Promise<MemoryEntry[]> {
  if (inputs.length === 0)
    return []

  // Group by character so we take one lock per character
  const byCharacter = new Map<string, MemoryInput[]>()
  for (const input of inputs) {
    const group = byCharacter.get(input.characterId) ?? []
    group.push(input)
    byCharacter.set(input.characterId, group)
  }

  const results: MemoryEntry[] = []
  const now = Date.now()

  for (const [characterId, group] of byCharacter) {
    const batch = await withLock(userId, characterId, async () => {
      const entries: MemoryEntry[] = group.map(input => ({
        id: crypto.randomUUID(),
        characterId: input.characterId,
        content: input.content,
        importance: input.presetImportance ?? 0.5,
        recency: input.presetRecency ?? 1.0,
        source: input.source ?? 'chat',
        type: input.type,
        tags: input.tags ?? [],
        createdAt: now,
        updatedAt: now,
        lastAccessedAt: now,
        accessCount: 0,
      }))

      const existing = await getAll(userId, characterId)
      existing.push(...entries)
      await saveAll(userId, characterId, existing)

      return entries
    })
    results.push(...batch)
  }

  return results
}

/**
 * Batch-update multiple entries across potentially different characters.
 * Groups by character and takes one lock per character group.
 */
async function bulkUpdate(
  userId: string,
  patches: Array<{ entry: MemoryEntry, patch: Partial<Pick<MemoryEntry, 'content' | 'importance' | 'recency' | 'tags' | 'summary' | 'lastAccessedAt' | 'accessCount' | 'type'>> }>,
): Promise<MemoryEntry[]> {
  if (patches.length === 0)
    return []

  const byCharacter = new Map<string, typeof patches>()
  for (const p of patches) {
    const group = byCharacter.get(p.entry.characterId) ?? []
    group.push(p)
    byCharacter.set(p.entry.characterId, group)
  }

  const results: MemoryEntry[] = []

  for (const [characterId, group] of byCharacter) {
    const batch = await withLock(userId, characterId, async () => {
      const all = await getAll(userId, characterId)
      const updated: MemoryEntry[] = []
      const now = Date.now()

      for (const { entry, patch } of group) {
        const index = all.findIndex(e => e.id === entry.id)
        if (index === -1)
          continue

        const merged: MemoryEntry = { ...all[index], ...patch, updatedAt: now }
        all[index] = merged
        updated.push(merged)
      }

      if (updated.length > 0) {
        await saveAll(userId, characterId, all)
      }

      return updated
    })
    results.push(...batch)
  }

  return results
}

async function clear(userId: string, characterId: string): Promise<void> {
  return withLock(userId, characterId, async () => {
    await Promise.all([
      storage.removeItem(scope(userId, characterId)),
      storage.removeItem(countKey(userId, characterId)),
    ])
  })
}

/**
 * Returns the count of memories for a character WITHOUT fetching the full
 * array from storage. Uses a separate count key maintained on every write.
 */
async function count(userId: string, characterId: string): Promise<number> {
  const stored = await storage.getItemRaw<number>(countKey(userId, characterId))
  return stored ?? 0
}

/**
 * Writes back a cleaned set of entries under lock.
 *
 * NOTE: This function acquires its OWN lock, so it must NOT be called
 * from inside an existing withLock callback for the same key — that
 * would cause a deadlock.  Currently unused; housekeeping uses saveAll
 * inside an outer withLock instead.
 * @deprecated Prefer `saveAll` inside an outer `withLock` to avoid re-entrancy.
 */
async function replaceAll(
  userId: string,
  characterId: string,
  cleaned: MemoryEntry[],
): Promise<void> {
  return withLock(userId, characterId, async () => {
    await Promise.all([
      storage.setItemRaw(scope(userId, characterId), cleaned),
      storage.setItemRaw(countKey(userId, characterId), cleaned.length),
    ])
  })
}

/**
 * Heals the count key by recomputing from the full entry array.
 * Called after migrations or when the count drifts.
 */
async function healCount(userId: string, characterId: string): Promise<number> {
  return withLock(userId, characterId, async () => {
    const all = await getAll(userId, characterId)
    await storage.setItemRaw(countKey(userId, characterId), all.length)
    return all.length
  })
}

/**
 * Touch retrieved entries: increment accessCount and update lastAccessedAt.
 * Done in a single lock-protected read-modify-write so the deltas are
 * always computed against the latest stored values.
 */
async function touch(
  userId: string,
  characterId: string,
  entryIds: string[],
): Promise<void> {
  return withLock(userId, characterId, async () => {
    const all = await getAll(userId, characterId)
    const now = Date.now()
    const idSet = new Set(entryIds)
    let changed = false

    for (const e of all) {
      if (idSet.has(e.id)) {
        e.lastAccessedAt = now
        e.accessCount += 1
        e.updatedAt = now
        changed = true
      }
    }

    if (changed) {
      await Promise.all([
        storage.setItemRaw(scope(userId, characterId), all),
        storage.setItemRaw(countKey(userId, characterId), all.length),
      ])
    }
  })
}

export const alayaRepo = {
  getAll,
  saveAll,
  create,
  update,
  remove,
  bulkCreate,
  bulkUpdate,
  clear,
  count,
  replaceAll,
  healCount,
  touch,
  /** Exposed for coarse-grained lock usage (housekeeping, batch ops). */
  withLock,
}
