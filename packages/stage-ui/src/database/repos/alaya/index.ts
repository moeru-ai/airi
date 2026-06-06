import type { CompactResult, ShortTermMemoryOptions, ShortTermTurn } from './short-term'
import type {
  AlayaOptions,
  AlayaSnapshot,
  MemoryEntry,
  MemoryInput,
  MemoryQuery,
  MemorySearchResult,
} from './types'

import { buildCompactMemoryContext, buildMemoryContext } from './context-builder'
import { alayaRepo } from './repo'
import { recent, retrieve } from './retriever'
import {
  DEFAULT_IMPORTANCE_WEIGHT,
  DEFAULT_RECENCY_WEIGHT,
  scoreImportance,
  scoreRecency,
} from './scorer'
import { ShortTermMemory } from './short-term'
import { summariseMemories } from './summarizer'

/**
 * Memory Alaya — the long-term memory driver for AIRI.
 *
 * ## Architecture position
 * ```
 * IndexedDB (unstorage) → AlayaRepo → AlayaMemory → Context Builder → Core
 * ```
 *
 * ## Key behaviours
 * - All data is persisted in IndexedDB via `unstorage`, scoped by userId.
 * - Per-character write locking prevents in-tab race conditions.
 * - Memories are scored on importance and real-time recency (exponential decay).
 * - Old memories are auto-summarised; low-score entries are evicted.
 *
 * ## Usage
 * ```ts
 * const alaya = createAlayaMemory({ userId: 'user-1' })
 *
 * // Ingest a memory from chat
 * await alaya.ingest({ characterId: 'char-1', content: 'User likes coffee' })
 *
 * // Retrieve and build context
 * const results = await alaya.query({ characterId: 'char-1', text: 'coffee' })
 * const ctx = alaya.buildContext(results)
 * ```
 */
export class AlayaMemory {
  #userId: string
  #maxUncompressed: number
  #summariseAfterMs: number
  #importanceWeight: number
  #recencyWeight: number
  #maxEntriesPerCharacter: number

  constructor(options: AlayaOptions = {}) {
    this.#userId = options.userId ?? 'default'

    this.#maxUncompressed = options.maxUncompressed ?? 200
    this.#summariseAfterMs = options.summariseAfterMs ?? 7 * 24 * 60 * 60 * 1000
    this.#importanceWeight = options.importanceWeight ?? DEFAULT_IMPORTANCE_WEIGHT
    this.#recencyWeight = options.recencyWeight ?? DEFAULT_RECENCY_WEIGHT
    this.#maxEntriesPerCharacter = options.maxEntriesPerCharacter ?? 1000
  }

  // ------------------------------------------------------------------
  // CRUD
  // ------------------------------------------------------------------

  /**
   * Ingest a single memory entry. Auto-scores importance & recency,
   * then runs housekeeping.
   */
  async ingest(input: MemoryInput): Promise<MemoryEntry> {
    // Create and score in one step — no need for a separate read-back
    const entry = await alayaRepo.create(input, this.#userId)

    // Score and update using the same lock (repo.update is lock-protected)
    const scored = await alayaRepo.update(this.#userId, entry, {
      importance: scoreImportance(entry),
      recency: scoreRecency(entry),
    })

    await this.#housekeep(input.characterId)

    return scored
  }

  /**
   * Bulk-ingest memories (e.g. post-chat memory extraction).
   * Scores in batch and runs housekeeping once per affected character.
   */
  async ingestAll(inputs: MemoryInput[]): Promise<MemoryEntry[]> {
    if (inputs.length === 0)
      return []

    const entries = await alayaRepo.bulkCreate(inputs, this.#userId)

    // Batch-score all entries in one update pass
    const patches = entries.map(entry => ({
      entry,
      patch: {
        importance: scoreImportance(entry),
        recency: scoreRecency(entry),
      },
    }))

    const scored = await alayaRepo.bulkUpdate(this.#userId, patches)

    // Housekeep each affected character once
    const affectedCharacters = new Set(inputs.map(i => i.characterId))
    for (const characterId of affectedCharacters) {
      await this.#housekeep(characterId)
    }

    return scored
  }

  async update(
    entry: MemoryEntry,
    patch: Partial<Pick<MemoryEntry, 'content' | 'importance' | 'tags' | 'type'>>,
  ): Promise<MemoryEntry> {
    return alayaRepo.update(this.#userId, entry, patch)
  }

  async forget(characterId: string, entryId: string): Promise<void> {
    await alayaRepo.remove(this.#userId, characterId, entryId)
  }

  async forgetAll(characterId: string): Promise<void> {
    await alayaRepo.clear(this.#userId, characterId)
  }

  // ------------------------------------------------------------------
  // Retrieval
  // ------------------------------------------------------------------

  async query(query: MemoryQuery): Promise<MemorySearchResult[]> {
    const entries = await alayaRepo.getAll(this.#userId, query.characterId)

    const results = await retrieve(entries, query, {
      importanceWeight: this.#importanceWeight,
      recencyWeight: this.#recencyWeight,
    })

    // Touch retrieved entries (batch update for performance)
    if (results.length > 0) {
      const patches = results.map(({ entry }) => ({
        entry,
        patch: {
          lastAccessedAt: Date.now(),
          accessCount: entry.accessCount + 1,
        },
      }))
      await alayaRepo.bulkUpdate(this.#userId, patches)
    }

    return results
  }

  async getRecent(characterId: string, n = 10): Promise<MemorySearchResult[]> {
    const entries = await alayaRepo.getAll(this.#userId, characterId)
    return recent(entries, characterId, n)
  }

  async getAll(characterId: string): Promise<MemoryEntry[]> {
    return alayaRepo.getAll(this.#userId, characterId)
  }

  /**
   * Returns memory count WITHOUT loading all entries from storage.
   */
  async count(characterId: string): Promise<number> {
    return alayaRepo.count(this.#userId, characterId)
  }

  // ------------------------------------------------------------------
  // Context building
  // ------------------------------------------------------------------

  buildContext(results: MemorySearchResult[]): string | null {
    return buildMemoryContext(results)
  }

  buildCompactContext(results: MemorySearchResult[]): string | null {
    return buildCompactMemoryContext(results)
  }

  // ------------------------------------------------------------------
  // Housekeeping
  // ------------------------------------------------------------------

  async housekeep(characterId: string): Promise<void> {
    await this.#housekeep(characterId)
  }

  async #housekeep(characterId: string): Promise<void> {
    const entries = await alayaRepo.getAll(this.#userId, characterId)

    const { entries: cleaned, modified } = summariseMemories(entries, {
      maxUncompressed: this.#maxUncompressed,
      summariseAfterMs: this.#summariseAfterMs,
      importanceWeight: this.#importanceWeight,
      recencyWeight: this.#recencyWeight,
      maxEntriesPerCharacter: this.#maxEntriesPerCharacter,
    })

    // Only persist when something actually changed
    if (modified.length > 0 || cleaned.length !== entries.length) {
      await alayaRepo.saveAll(this.#userId, characterId, cleaned)
    }
  }

  // ------------------------------------------------------------------
  // Observability
  // ------------------------------------------------------------------

  async snapshot(characterId: string): Promise<AlayaSnapshot> {
    const entries = await alayaRepo.getAll(this.#userId, characterId)

    if (entries.length === 0) {
      return {
        characterId,
        totalEntries: 0,
        newestEntryAt: null,
        oldestEntryAt: null,
      }
    }

    const sorted = [...entries].sort((a, b) => a.createdAt - b.createdAt)

    return {
      characterId,
      totalEntries: entries.length,
      oldestEntryAt: sorted[0].createdAt,
      newestEntryAt: sorted[sorted.length - 1].createdAt,
    }
  }
}

export function createAlayaMemory(options: AlayaOptions = {}): AlayaMemory {
  return new AlayaMemory(options)
}

export { ShortTermMemory }
export type { CompactResult, ShortTermMemoryOptions, ShortTermTurn }
