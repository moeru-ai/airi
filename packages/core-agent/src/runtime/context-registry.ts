import type { MetadataEventSource } from '@proj-airi/server-shared/types'

import type { ContextMessage } from '../types/chat'

const CONTEXT_UPDATE_REPLACE_SELF = 'replace-self'
const CONTEXT_UPDATE_APPEND_SELF = 'append-self'

interface EventSourcePayload {
  source?: string
  metadata?: { source?: MetadataEventSource }
}

/**
 * Stored context event with the registry bucket key resolved at ingest time.
 */
export interface ContextHistoryEntry extends ContextMessage {
  /** Stable source bucket key derived from metadata, source, or fallback. */
  sourceKey: string
}

/**
 * Observable result emitted when a context update mutates an active bucket.
 */
export interface ContextIngestResult {
  /** Stable source bucket key affected by the ingest. */
  sourceKey: string
  /** Registry mutation applied to the active bucket. */
  mutation: 'replace' | 'append'
  /** Number of active entries in the affected bucket after mutation. */
  entryCount: number
}

/** Identifies a session and its bindings when it reads the shared context pool. */
export interface ContextReader {
  /** Exact destination identities. A match never grants instruction or tool authority. */
  ids: readonly string[]
  /** A lane-scoped entry requires this lane. Entries without a lane remain eligible. */
  lane?: string
}

/**
 * Owns context slots partitioned by writer, plus bounded ingest history.
 */
export interface ContextRegistry {
  /** Stores a context message and returns a mutation summary for known strategies. */
  ingest: (envelope: ContextMessage) => ContextIngestResult | undefined
  /** Clears active context buckets and ingest history. */
  reset: () => void
  /** Returns a cloned reader projection. Omit the reader only for local diagnostics. */
  snapshot: (reader?: ContextReader) => Record<string, ContextMessage[]>
  /** Returns cloned active context buckets for callers that prefer explicit naming. */
  activeContexts: () => Record<string, ContextMessage[]>
  /** Returns cloned ingest history entries in chronological order. */
  contextHistory: () => ContextHistoryEntry[]
}

interface CreateContextRegistryOptions {
  /**
   * Maximum number of history records retained by the registry.
   *
   * @default 400
   */
  historyLimit?: number
  /**
   * Resolves a context message into a stable source bucket key.
   *
   * @default metadata extension/module key, then event source, then "unknown"
   */
  getSourceKey?: (event: EventSourcePayload, fallback?: string) => string
  /** Observation lifetime when no TTL is supplied. @default 60000 */
  defaultTtlMs?: number
  /** Total active text budget. @default 800 */
  maxTokens?: number
  /** Active text budget for each writer. @default 200 */
  maxWriterTokens?: number
  /** Maximum text cost of one entry. @default 80 */
  maxEntryTokens?: number
  /** Maximum retained events in one append slot. @default 8 */
  maxEntriesPerSlot?: number
  /** Counts text cost. UTF-8 bytes provide a conservative tokenizer-independent default. @default UTF-8 byte count */
  countTokens?: (text: string) => number
  /** Clock for observation expiry. @default Date.now */
  now?: () => number
}

interface StoredContext {
  message: ContextMessage
  tokens: number
  expiresAt: number
}

const EMPTY_CONTEXTS: readonly StoredContext[] = Object.freeze([])

function formatMetadataSource(source?: MetadataEventSource) {
  if (!source)
    return undefined

  if ('extension' in source) {
    return `${source.extension.id}:${source.id}`
  }

  return source.id
}

function defaultGetSourceKey(event: EventSourcePayload, fallback = 'unknown') {
  return (
    formatMetadataSource(event.metadata?.source)
    ?? event.source
    ?? fallback
  )
}

function isVisibleToReader(message: ContextMessage, sourceKey: string, reader: ContextReader): boolean {
  if (message.lane !== undefined && message.lane !== reader.lane)
    return false

  const destinations = message.destinations
  if (Array.isArray(destinations))
    return destinations.some(id => reader.ids.includes(id))

  if (destinations && 'all' in destinations)
    return destinations.all === true

  if (destinations?.exclude?.some(id => reader.ids.includes(id)))
    return false

  if (destinations?.include !== undefined)
    return destinations.include.some(id => reader.ids.includes(id))

  // Unaddressed observations belong to their writer. Sharing requires an explicit destination.
  return reader.ids.includes(sourceKey)
}

/**
 * Creates a context registry that owns active buckets and bounded ingest history.
 *
 * Use when:
 * - Runtime contexts need replace-self or append-self slot semantics.
 * - UI or transport layers need cloned snapshots without owning mutation policy.
 *
 * Expects:
 * - Context messages are structured-cloneable before they enter the registry.
 * - Unknown strategies remain in history for observability.
 *
 * Returns:
 * - A registry whose snapshots cannot mutate internal active bucket state.
 */
export function createContextRegistry(options: CreateContextRegistryOptions = {}): ContextRegistry {
  const historyLimit = options.historyLimit ?? 400
  const getSourceKey = options.getSourceKey ?? defaultGetSourceKey
  const defaultTtlMs = options.defaultTtlMs ?? 60_000
  const maxTokens = options.maxTokens ?? 800
  const maxWriterTokens = options.maxWriterTokens ?? 200
  const maxEntryTokens = options.maxEntryTokens ?? 80
  const maxEntriesPerSlot = options.maxEntriesPerSlot ?? 8
  const now = options.now ?? Date.now
  const encoder = new TextEncoder()
  const countTokens = options.countTokens ?? ((text: string) => encoder.encode(text).length)

  for (const limit of [historyLimit, defaultTtlMs, maxTokens, maxWriterTokens, maxEntryTokens, maxEntriesPerSlot]) {
    if (!Number.isFinite(limit) || limit <= 0)
      throw new RangeError('Context registry limits must be positive and finite')
  }

  let currentActiveContexts = new Map<string, StoredContext[]>()
  let currentContextHistory: ContextHistoryEntry[] = []

  function pruneExpired(timestamp: number) {
    for (const [sourceKey, entries] of currentActiveContexts) {
      const live = entries.filter(entry => entry.expiresAt > timestamp)
      if (live.length)
        currentActiveContexts.set(sourceKey, live)
      else if (entries.length)
        currentActiveContexts.delete(sourceKey)
    }
  }

  function retention(entry: StoredContext, timestamp: number) {
    const lifetime = entry.expiresAt - entry.message.createdAt
    const freshness = Math.min(1, (entry.expiresAt - timestamp) / lifetime)
    const salience = entry.message.salience ?? 0.5
    return Math.max(0, Math.min(1, salience)) * Math.max(0, freshness)
  }

  function ingest(envelope: ContextMessage): ContextIngestResult | undefined {
    const sourceKey = getSourceKey(envelope)
    const safeEnvelopeToStore = structuredClone(envelope)
    const timestamp = now()
    const countedTokens = countTokens(safeEnvelopeToStore.text)
    if (!Number.isFinite(countedTokens) || countedTokens < 0)
      throw new RangeError('Context token cost must be finite and nonnegative')
    // Empty observations still consume one unit, so token limits also bound entry count.
    const tokens = Math.max(1, countedTokens)

    const ttlMs = envelope.ttlMs ?? defaultTtlMs
    const expiresAt = Math.min(envelope.expiresAt ?? Infinity, envelope.createdAt + ttlMs)
    pruneExpired(timestamp)

    currentContextHistory = [
      ...currentContextHistory,
      { ...safeEnvelopeToStore, sourceKey },
    ].slice(-historyLimit)

    if (!Number.isFinite(expiresAt) || expiresAt <= timestamp
      || !Number.isFinite(envelope.createdAt) || !Number.isFinite(envelope.salience ?? 0.5)
      || tokens > Math.min(maxEntryTokens, maxWriterTokens, maxTokens)) {
      return undefined
    }

    if (envelope.strategy !== CONTEXT_UPDATE_REPLACE_SELF && envelope.strategy !== CONTEXT_UPDATE_APPEND_SELF)
      return undefined

    const incoming: StoredContext = { message: safeEnvelopeToStore, tokens, expiresAt }
    const previous = currentActiveContexts.get(sourceKey) ?? EMPTY_CONTEXTS
    let candidates: StoredContext[]
    if (envelope.strategy === CONTEXT_UPDATE_REPLACE_SELF) {
      // A writer can publish independent slots. Replacing one slot preserves its siblings.
      candidates = previous.filter(entry => entry.message.contextId !== envelope.contextId)
    }
    else {
      let retainedInSlot = 0
      const retained = new Set<StoredContext>()
      for (let index = previous.length - 1; index >= 0; index--) {
        const entry = previous[index]
        if (entry.message.contextId !== envelope.contextId || ++retainedInSlot < maxEntriesPerSlot)
          retained.add(entry)
      }
      candidates = previous.filter(entry => retained.has(entry))
    }
    candidates.push(incoming)

    // Admission is transactional. A rejected update cannot erase the previous slot or evict other writers.
    const next = new Map(currentActiveContexts)
    next.set(sourceKey, candidates)
    const ranked = Array.from(next, ([writer, entries]) => entries.map(entry => ({ writer, entry })))
      .flat()
      .sort((a, b) => retention(a.entry, timestamp) - retention(b.entry, timestamp))
    let total = ranked.reduce((sum, item) => sum + item.entry.tokens, 0)
    let writerTotal = candidates.reduce((sum, entry) => sum + entry.tokens, 0)
    for (const { writer, entry } of ranked) {
      if (writerTotal > maxWriterTokens && writer !== sourceKey)
        continue
      if (writerTotal <= maxWriterTokens && total <= maxTokens)
        break
      if (entry === incoming)
        return undefined

      const retained = next.get(writer)!.filter(candidate => candidate !== entry)
      if (retained.length)
        next.set(writer, retained)
      else
        next.delete(writer)
      total -= entry.tokens
      if (writer === sourceKey)
        writerTotal -= entry.tokens
    }
    currentActiveContexts = next

    return {
      sourceKey,
      mutation: envelope.strategy === CONTEXT_UPDATE_REPLACE_SELF ? 'replace' : 'append',
      entryCount: currentActiveContexts.get(sourceKey)?.length ?? 0,
    }
  }

  function reset() {
    currentActiveContexts = new Map<string, StoredContext[]>()
    currentContextHistory = []
  }

  function snapshot(reader?: ContextReader) {
    pruneExpired(now())
    return Object.fromEntries(
      Array.from(currentActiveContexts, ([sourceKey, entries]) => {
        const messages = entries.map(entry => entry.message)
        const visible = reader ? messages.filter(message => isVisibleToReader(message, sourceKey, reader)) : messages
        return [sourceKey, structuredClone(visible)] as const
      }).filter(([, messages]) => !reader || messages.length > 0),
    )
  }

  return {
    ingest,
    reset,
    snapshot,
    activeContexts: snapshot,
    contextHistory: () => structuredClone(currentContextHistory),
  }
}
