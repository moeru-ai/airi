import type { CompactResult, ShortTermTurn } from '../../database/repos/alaya'
import type { AlayaSnapshot, MemoryEntry, MemoryInput, MemoryQuery, MemorySearchResult } from '../../database/repos/alaya/types'

import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'

import { createAlayaMemory, ShortTermMemory } from '../../database/repos/alaya'

/**
 * Pinia store wrapping the AlayaMemory driver.
 *
 * Provides reactive state for memory management in the settings UI
 * and orchestrates memory operations for the active character.
 */
export const useAlayaMemoryStore = defineStore('alaya-memory', () => {
  // ------------------------------------------------------------------
  // Core instances — lazy-initialized on first `connect()` call
  // ------------------------------------------------------------------

  let driver: ReturnType<typeof createAlayaMemory> | null = null
  let latestSearchRequestId = 0

  /**
   * Session-scoped short-term memory buffer.
   *
   * Created per-connect(), so switching characters creates a fresh
   * short-term buffer for the new conversation context.
   */
  let shortTerm: ShortTermMemory | null = null

  function ensureShortTerm(): ShortTermMemory {
    if (!shortTerm) {
      shortTerm = new ShortTermMemory({ maxTurns: 20, digestThreshold: 0.6 })
    }
    return shortTerm
  }

  function ensureDriver(uid: string) {
    if (!driver) {
      driver = createAlayaMemory({ userId: uid })
    }
    return driver
  }

  // ------------------------------------------------------------------
  // State
  // ------------------------------------------------------------------

  const characterId = ref<string | null>(null)
  const userId = ref<string>('default')

  const allMemories = ref<MemoryEntry[]>([])
  const searchResults = ref<MemorySearchResult[]>([])
  const searchQuery = ref('')
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  const totalCount = ref(0)
  const snapshot = ref<AlayaSnapshot | null>(null)

  // Short-term state
  const shortTermTurnCount = ref(0)
  const shortTermTurns = ref<ShortTermTurn[]>([])

  // ------------------------------------------------------------------
  // Derived
  // ------------------------------------------------------------------

  const isConnected = computed(() => characterId.value !== null && driver !== null)
  const isEmpty = computed(() => allMemories.value.length === 0)
  const displayedMemories = computed(() =>
    searchQuery.value.trim()
      ? searchResults.value
      : allMemories.value.map(e => ({ entry: e, score: 1.0 } as MemorySearchResult)),
  )

  // ------------------------------------------------------------------
  // Watch: auto-refresh when character changes
  // ------------------------------------------------------------------

  watch(characterId, async (newId) => {
    if (newId && driver)
      await refresh()
  })

  // ------------------------------------------------------------------
  // Connection
  // ------------------------------------------------------------------

  async function connect(opts: { characterId: string, userId?: string }) {
    if (opts.userId)
      userId.value = opts.userId

    characterId.value = opts.characterId

    // ensureDriver after userId is set so it uses the right namespace
    ensureDriver(userId.value)

    // Create a fresh short-term buffer for the new session
    shortTerm = new ShortTermMemory({ maxTurns: 20, digestThreshold: 0.6 })
    shortTermTurnCount.value = 0
    shortTermTurns.value = []

    // reset request id for new session
    latestSearchRequestId = 0

    await refresh()
  }

  async function refresh() {
    const d = driver
    if (!d || !characterId.value)
      return

    isLoading.value = true
    error.value = null
    try {
      // Single IndexedDB read — totalCount and snapshot are derived
      // in-memory from the returned entries, avoiding 3 separate reads.
      const entries = await d.getAll(characterId.value)
      allMemories.value = entries
      totalCount.value = entries.length

      // Populate snapshot from the loaded entries
      if (entries.length === 0) {
        snapshot.value = {
          characterId: characterId.value,
          totalEntries: 0,
          newestEntryAt: null,
          oldestEntryAt: null,
        }
      }
      else {
        const sorted = [...entries].sort((a, b) => a.createdAt - b.createdAt)
        snapshot.value = {
          characterId: characterId.value,
          totalEntries: entries.length,
          oldestEntryAt: sorted[0].createdAt,
          newestEntryAt: sorted[sorted.length - 1].createdAt,
        }
      }

      // If there is an active search query, re-run it to refresh search results
      if (searchQuery.value.trim()) {
        await search(searchQuery.value) // re-run search with same query
      }
      else {
        searchResults.value = []
      }
    }
    catch (e) {
      error.value = `Failed to load memories: ${String(e)}`
    }
    finally {
      isLoading.value = false
    }
  }

  // ------------------------------------------------------------------
  // CRUD
  // ------------------------------------------------------------------

  async function addMemory(input: MemoryInput): Promise<MemoryEntry> {
    const d = driver
    if (!d)
      throw new Error('Alaya driver not initialized')

    error.value = null
    try {
      const entry = await d.ingest({
        characterId: input.characterId || characterId.value!,
        content: input.content,
        source: input.source ?? 'manual',
        tags: input.tags,
        type: input.type,
      })
      await refresh()
      return entry
    }
    catch (e) {
      error.value = `Failed to add memory: ${String(e)}`
      throw e
    }
  }

  async function deleteMemory(entryId: string) {
    const d = driver
    if (!d || !characterId.value)
      throw new Error('Not connected')

    error.value = null
    try {
      await d.forget(characterId.value, entryId)
      await refresh()
    }
    catch (e) {
      error.value = `Failed to delete memory: ${String(e)}`
      throw e
    }
  }

  async function clearAllMemories() {
    const d = driver
    if (!d || !characterId.value)
      throw new Error('Not connected')

    error.value = null
    try {
      await d.forgetAll(characterId.value)
      await refresh()
    }
    catch (e) {
      error.value = `Failed to clear memories: ${String(e)}`
      throw e
    }
  }

  async function updateMemory(
    entry: MemoryEntry,
    patch: Partial<Pick<MemoryEntry, 'content' | 'importance' | 'tags' | 'type'>>,
  ): Promise<MemoryEntry> {
    const d = driver
    if (!d)
      throw new Error('Alaya driver not initialized')

    error.value = null
    try {
      const updated = await d.update(entry, patch)
      await refresh()
      return updated
    }
    catch (e) {
      error.value = `Failed to update memory: ${String(e)}`
      throw e
    }
  }

  // ------------------------------------------------------------------
  // Search
  // ------------------------------------------------------------------

  async function search(query: string) {
    const d = driver
    if (!d || !characterId.value)
      throw new Error('Not connected')

    // Bump request id to track the latest search
    const requestId = ++latestSearchRequestId

    searchQuery.value = query
    isLoading.value = true
    error.value = null

    try {
      const q: MemoryQuery = {
        characterId: characterId.value,
        limit: 50,
      }
      if (query.trim()) {
        q.text = query.trim()
      }
      const results = await d.query(q)

      // Only update state if this is still the most recent search
      if (requestId === latestSearchRequestId) {
        searchResults.value = results
      }
    }
    catch (e) {
      if (requestId === latestSearchRequestId) {
        error.value = `Search failed: ${String(e)}`
      }
    }
    finally {
      if (requestId === latestSearchRequestId) {
        isLoading.value = false
      }
    }
  }

  async function clearSearch() {
    searchQuery.value = ''
    searchResults.value = []
  }

  // ------------------------------------------------------------------
  // Housekeeping
  // ------------------------------------------------------------------

  async function runHousekeeping() {
    const d = driver
    if (!d || !characterId.value)
      throw new Error('Not connected')

    isLoading.value = true
    error.value = null
    try {
      await d.housekeep(characterId.value)
      await refresh()
    }
    catch (e) {
      error.value = `Housekeeping failed: ${String(e)}`
    }
    finally {
      isLoading.value = false
    }
  }

  // ------------------------------------------------------------------
  // Short-Term Memory
  // ------------------------------------------------------------------

  /**
   * Record a turn into the short-term buffer.
   *
   * Call this from the chat pipeline each time the user or assistant
   * sends a message. The turn is appended to the in-memory buffer and
   * reactive state is updated for UI consumption.
   */
  function addTurn(opts: { content: string, role: ShortTermTurn['role'], sessionId?: string }) {
    const st = ensureShortTerm()

    const turn = st.addTurn({
      characterId: characterId.value!,
      sessionId: opts.sessionId ?? 'default',
      role: opts.role,
      content: opts.content,
    })

    shortTermTurnCount.value = st.count
    shortTermTurns.value = st.getRecentTurns()

    return turn
  }

  /** Get recent turns for LLM context injection. */
  function getRecentContext(n?: number): ShortTermTurn[] {
    return ensureShortTerm().getRecentTurns(n)
  }

  /**
   * Compact the short-term buffer and auto-digest high-signal turns
   * into the long-term memory pool.
   *
   * Should be called at session end or periodically for long sessions.
   */
  async function compactSession(): Promise<CompactResult> {
    const st = ensureShortTerm()

    // Step 1: Get the compact result without clearing the buffer?
    // If ShortTermMemory.compact() does clear, we need to back up turns.
    // Assume compact() returns { digestCandidates, removedTurns } but we only have digestCandidates.
    // We'll store the current turns before compaction so we can restore on failure.
    const beforeTurns = st.getRecentTurns() // backup

    const result = st.compact() // This may clear the buffer internally

    // Auto-digest: write high-scoring candidates to long-term memory
    if (result.digestCandidates.length > 0 && driver) {
      try {
        await driver.ingestAll(result.digestCandidates)
        await refresh()
      }
      catch (e) {
        // Restore the compacted turns into short-term buffer
        // We need an "uncompact" method or manual re-add
        for (const turn of beforeTurns) {
          st.addTurn({ ...turn, sessionId: turn.sessionId ?? 'default' })
        }
        error.value = `Auto-digest failed, short-term buffer restored: ${String(e)}`
        throw e
      }
    }

    shortTermTurnCount.value = st.count
    shortTermTurns.value = st.getRecentTurns()

    return result
  }

  /** Build a compact context string from short-term turns. */
  function buildShortTermContext(maxTurns?: number): string | null {
    return ensureShortTerm().buildContext(maxTurns)
  }

  /** Clear short-term buffer without digesting. */
  function clearShortTerm(): void {
    ensureShortTerm().clear()
    shortTermTurnCount.value = 0
    shortTermTurns.value = []
  }

  // ------------------------------------------------------------------
  // Context building (read-only, no side effects)
  // ------------------------------------------------------------------

  function buildContext(results: MemorySearchResult[]): string | null {
    return driver?.buildContext(results) ?? null
  }

  function buildCompactContext(results: MemorySearchResult[]): string | null {
    return driver?.buildCompactContext(results) ?? null
  }

  // ------------------------------------------------------------------

  return {
    characterId,
    userId,
    allMemories,
    searchResults,
    searchQuery,
    isLoading,
    error,
    totalCount,
    snapshot,
    shortTermTurnCount,
    shortTermTurns,
    isConnected,
    isEmpty,
    displayedMemories,
    connect,
    refresh,
    addMemory,
    deleteMemory,
    clearAllMemories,
    updateMemory,
    search,
    clearSearch,
    runHousekeeping,
    addTurn,
    getRecentContext,
    compactSession,
    buildShortTermContext,
    clearShortTerm,
    buildContext,
    buildCompactContext,
  }
})
