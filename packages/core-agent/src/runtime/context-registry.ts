import type { MetadataEventSource } from '@proj-airi/server-shared/types'

import type { ContextMessage } from '../types/chat'
import type { Audience } from './audience'
import type { ContextTokenCounter } from './context-budget'

import { audienceIncludes, OWNER_AUDIENCE } from './audience'
import { CONTEXT_ENTRY_TOKEN_LIMIT } from './context-budget'

const CONTEXT_UPDATE_REPLACE_SELF = 'replace-self'
const CONTEXT_UPDATE_APPEND_SELF = 'append-self'

interface EventSourcePayload {
  source?: string
  metadata?: { source?: MetadataEventSource }
}

/**
 * Bounded delivery record for diagnostics and deduplication. It never retains rejected or oversized text.
 */
export interface ContextHistoryEntry extends Pick<ContextMessage, 'id' | 'contextId' | 'strategy' | 'lane' | 'createdAt'> {
  /** Stable source bucket key derived from metadata, source, or fallback. */
  sourceKey: string
  /** Observation text, present only when it fits the entry budget. */
  text?: string
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
  /** Restricts the reader to one lane and unscoped entries. Omit it to subscribe to every lane. */
  lane?: string
  /** The run's effective audience. An entry is readable only when its allowed audience includes it. */
  audience?: Audience
}

/**
 * Owns context slots partitioned by writer, plus bounded ingest history.
 */
export interface ContextRegistry {
  /** Stores a context message and returns a mutation summary for known strategies. */
  ingest: (envelope: ContextMessage) => ContextIngestResult | undefined
  /** Clears active context buckets and ingest history. */
  reset: () => void
  /** Removes one writer's active slots and preserves bounded delivery history. */
  removeWriter: (sourceKey: string) => boolean
  /** Returns a cloned reader projection. Omit the reader only for local diagnostics. */
  snapshot: (reader?: ContextReader) => Record<string, ContextMessage[]>
  /** Returns cloned active context buckets for callers that prefer explicit naming. */
  activeContexts: () => Record<string, ContextMessage[]>
  /** Returns cloned ingest history entries in chronological order. */
  contextHistory: () => ContextHistoryEntry[]
  /** Captures trusted replication state without replaying admission or restarting lifetimes. */
  checkpoint: () => ContextRegistryState
}

/** Trusted host replication state. Do not accept checkpoints from module transports. */
export interface ContextRegistryState {
  active: Record<string, StoredContext[]>
  history: ContextHistoryEntry[]
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
  /** Maximum serialized size of one stored entry, in UTF-8 bytes. It bounds replication of fields outside the text budget. @default 2048 */
  maxEntryBytes?: number
  /** Maximum retained events in one append slot. @default 8 */
  maxEntriesPerSlot?: number
  /** Fixed slots that accept append updates within each writer bucket. An empty list disables append. @default ['events'] */
  appendContextIds?: readonly string[]
  /** Counts text cost for the pool, independently of provider billing. Required for ingest. See `loadContextTokenCounter`. */
  countTokens?: ContextTokenCounter
  /** Clock for observation expiry. @default Date.now */
  now?: () => number
  /** A checkpoint from the same host policy, not an untrusted observation. */
  initialState?: ContextRegistryState
}

interface StoredContext {
  message: ContextMessage
  tokens: number
  expiresAt: number
}

const EMPTY_CONTEXTS: readonly StoredContext[] = Object.freeze([])

const entryEncoder = new TextEncoder()

/** Keeps the fields that pool projection, expiry, and routing read. Content, ideas, and hints stay with the producer. */
function toPoolMessage(message: ContextMessage): ContextMessage {
  const { id, contextId, strategy, lane, text, destinations, ttlMs, salience, sourceRef, createdAt, expiresAt, metadata, audience } = message
  return { id, contextId, strategy, lane, text, destinations, ttlMs, salience, sourceRef, createdAt, expiresAt, metadata, audience }
}

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
  // Lanes describe subscriptions. Destinations and audience labels decide visibility.
  if (reader.lane !== undefined && message.lane !== undefined && message.lane !== reader.lane)
    return false
  if (reader.audience && !audienceIncludes(message.audience ?? OWNER_AUDIENCE, reader.audience))
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

/** Reads a replicated checkpoint without mutating it or extending observation lifetimes. */
export function projectContextRegistryState(state: ContextRegistryState, reader?: ContextReader, timestamp = Date.now()): Record<string, ContextMessage[]> {
  return Object.fromEntries(
    Object.entries(state.active).map(([sourceKey, entries]) => [
      sourceKey,
      structuredClone(entries
        .filter(entry => entry.expiresAt > timestamp && (!reader || isVisibleToReader(entry.message, sourceKey, reader)))
        .map(entry => entry.message)),
    ] as const).filter(([, messages]) => messages.length > 0),
  )
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
  const maxEntryTokens = options.maxEntryTokens ?? CONTEXT_ENTRY_TOKEN_LIMIT
  const maxEntryBytes = options.maxEntryBytes ?? 2048
  const maxEntriesPerSlot = options.maxEntriesPerSlot ?? 8
  const appendContextIds = new Set(options.appendContextIds ?? ['events'])
  const now = options.now ?? Date.now
  const countTokens = options.countTokens

  for (const limit of [historyLimit, defaultTtlMs, maxTokens, maxWriterTokens, maxEntryTokens, maxEntryBytes, maxEntriesPerSlot]) {
    if (!Number.isFinite(limit) || limit <= 0)
      throw new RangeError('Context registry limits must be positive and finite')
  }

  const initialState = options.initialState ? structuredClone(options.initialState) : undefined
  let currentActiveContexts = new Map<string, StoredContext[]>(Object.entries(initialState?.active ?? {}))
  let currentContextHistory: ContextHistoryEntry[] = (initialState?.history ?? []).slice(-historyLimit)

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
    if (!countTokens)
      throw new Error('Context registry needs a token counter to admit observations')
    const sourceKey = getSourceKey(envelope)
    const safeEnvelopeToStore = toPoolMessage(structuredClone(envelope))
    const timestamp = now()
    const countedTokens = countTokens(safeEnvelopeToStore.text)
    if (!Number.isFinite(countedTokens) || countedTokens < 0)
      throw new RangeError('Context token cost must be finite and nonnegative')
    // Empty observations still consume one unit, so token limits also bound entry count.
    const tokens = Math.max(1, countedTokens)
    const fitsTextBudget = tokens <= Math.min(maxEntryTokens, maxWriterTokens, maxTokens)

    const ttlMs = envelope.ttlMs ?? defaultTtlMs
    const expiresAt = Math.min(envelope.expiresAt ?? Infinity, envelope.createdAt + ttlMs)
    pruneExpired(timestamp)

    currentContextHistory = [
      ...currentContextHistory,
      {
        id: safeEnvelopeToStore.id,
        contextId: safeEnvelopeToStore.contextId,
        strategy: safeEnvelopeToStore.strategy,
        lane: safeEnvelopeToStore.lane,
        createdAt: safeEnvelopeToStore.createdAt,
        sourceKey,
        text: fitsTextBudget ? safeEnvelopeToStore.text : undefined,
      },
    ].slice(-historyLimit)

    if (!Number.isFinite(expiresAt) || expiresAt <= timestamp
      || !Number.isFinite(envelope.createdAt) || !Number.isFinite(envelope.salience ?? 0.5)
      || !fitsTextBudget
      || entryEncoder.encode(JSON.stringify(safeEnvelopeToStore)).length > maxEntryBytes) {
      return undefined
    }

    if (envelope.strategy !== CONTEXT_UPDATE_REPLACE_SELF && envelope.strategy !== CONTEXT_UPDATE_APPEND_SELF)
      return undefined

    // A writer cannot create an unbounded set of event windows with arbitrary slot identifiers.
    if (envelope.strategy === CONTEXT_UPDATE_APPEND_SELF && !appendContextIds.has(envelope.contextId))
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
    const byRetention = (a: { entry: StoredContext }, b: { entry: StoredContext }) => retention(a.entry, timestamp) - retention(b.entry, timestamp)
    const evict = (writer: string, entry: StoredContext) => {
      const retained = next.get(writer)!.filter(candidate => candidate !== entry)
      if (retained.length)
        next.set(writer, retained)
      else
        next.delete(writer)
    }

    // The writer budget evicts only the incoming writer's entries.
    let writerTotal = candidates.reduce((sum, entry) => sum + entry.tokens, 0)
    for (const { entry } of candidates.map(entry => ({ entry })).sort(byRetention)) {
      if (writerTotal <= maxWriterTokens)
        break
      if (entry === incoming)
        return undefined
      evict(sourceKey, entry)
      writerTotal -= entry.tokens
    }

    // The pool budget then evicts the lowest retention across all writers.
    const ranked = Array.from(next, ([writer, entries]) => entries.map(entry => ({ writer, entry }))).flat().sort(byRetention)
    let total = ranked.reduce((sum, item) => sum + item.entry.tokens, 0)
    for (const { writer, entry } of ranked) {
      if (total <= maxTokens)
        break
      if (entry === incoming)
        return undefined
      evict(writer, entry)
      total -= entry.tokens
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
    const timestamp = now()
    pruneExpired(timestamp)
    return projectContextRegistryState({ active: Object.fromEntries(currentActiveContexts), history: currentContextHistory }, reader, timestamp)
  }

  function checkpoint(): ContextRegistryState {
    pruneExpired(now())
    return structuredClone({ active: Object.fromEntries(currentActiveContexts), history: currentContextHistory })
  }

  return {
    ingest,
    reset,
    removeWriter: sourceKey => currentActiveContexts.delete(sourceKey),
    snapshot,
    activeContexts: snapshot,
    contextHistory: () => structuredClone(currentContextHistory),
    checkpoint,
  }
}
