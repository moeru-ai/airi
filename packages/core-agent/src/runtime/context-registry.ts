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

/** Identifies a session and its scene bindings when it reads the context pool. */
export interface ContextReader {
  /** Exact reader identities that object destinations can name. A match never grants instruction or tool authority. */
  ids: readonly string[]
  /** Whether the reader is the owner's own conversation. Observations without object destinations reach only the owner. */
  owner: boolean
}

/**
 * Mutable runtime registry for active context buckets and bounded ingest history.
 */
export interface ContextRegistry {
  /** Stores a context message and returns a mutation summary for known strategies. */
  ingest: (envelope: ContextMessage) => ContextIngestResult | undefined
  /** Clears active context buckets and ingest history. */
  reset: () => void
  /** Removes one writer's active entries, for example after the module leaves. */
  removeWriter: (sourceKey: string) => boolean
  /** Returns a cloned active context bucket snapshot. With a reader, only the entries that it can read. */
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

/**
 * Object destinations name logical readers. Array destinations are transport addresses, so they decide nothing here.
 * Without object destinations, an observation reaches only the owner's own conversation, never an external scene.
 */
function isVisibleToReader(message: ContextMessage, reader: ContextReader) {
  const destinations = message.destinations
  if (!destinations || Array.isArray(destinations))
    return reader.owner
  if ('all' in destinations)
    return destinations.all === true
  if (destinations.exclude?.some(id => reader.ids.includes(id)))
    return false
  if (destinations.include !== undefined)
    return destinations.include.some(id => reader.ids.includes(id))
  return reader.owner
}

/**
 * Creates a context registry that owns active buckets and bounded ingest history.
 *
 * Use when:
 * - Runtime contexts need replace-self or append-self bucket semantics.
 * - UI or transport layers need cloned snapshots without owning mutation policy.
 *
 * Expects:
 * - Context messages are structured-cloneable before they enter the registry.
 * - Unknown strategies should still be recorded in history for observability.
 *
 * Returns:
 * - A registry whose snapshots cannot mutate internal active bucket state.
 */
export function createContextRegistry(options: CreateContextRegistryOptions = {}): ContextRegistry {
  const historyLimit = options.historyLimit ?? 400
  const getSourceKey = options.getSourceKey ?? defaultGetSourceKey

  let currentActiveContexts = new Map<string, ContextMessage[]>()
  let currentContextHistory: ContextHistoryEntry[] = []

  function ingest(envelope: ContextMessage): ContextIngestResult | undefined {
    const sourceKey = getSourceKey(envelope)
    const safeEnvelopeToStore = structuredClone(envelope)

    if (!currentActiveContexts.has(sourceKey)) {
      currentActiveContexts.set(sourceKey, [])
    }

    let result: ContextIngestResult | undefined

    if (envelope.strategy === CONTEXT_UPDATE_REPLACE_SELF) {
      currentActiveContexts.set(sourceKey, [safeEnvelopeToStore])
      result = {
        sourceKey,
        mutation: 'replace',
        entryCount: currentActiveContexts.get(sourceKey)?.length ?? 0,
      }
    }
    else if (envelope.strategy === CONTEXT_UPDATE_APPEND_SELF) {
      currentActiveContexts.get(sourceKey)?.push(safeEnvelopeToStore)
      result = {
        sourceKey,
        mutation: 'append',
        entryCount: currentActiveContexts.get(sourceKey)?.length ?? 0,
      }
    }

    currentContextHistory = [
      ...currentContextHistory,
      {
        ...safeEnvelopeToStore,
        sourceKey,
      },
    ].slice(-historyLimit)

    return result
  }

  function reset() {
    currentActiveContexts = new Map<string, ContextMessage[]>()
    currentContextHistory = []
  }

  function snapshot(reader?: ContextReader) {
    return Object.fromEntries(
      Array.from(currentActiveContexts, ([sourceKey, messages]) => [
        sourceKey,
        structuredClone(reader ? messages.filter(message => isVisibleToReader(message, reader)) : messages),
      ] as const).filter(([, messages]) => !reader || messages.length > 0),
    )
  }

  return {
    ingest,
    reset,
    removeWriter: sourceKey => currentActiveContexts.delete(sourceKey),
    snapshot,
    activeContexts: () => snapshot(),
    contextHistory: () => structuredClone(currentContextHistory),
  }
}
