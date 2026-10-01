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
      // A writer can publish independent slots. Replacing one slot preserves its siblings.
      const retained = currentActiveContexts.get(sourceKey)?.filter(message => message.contextId !== envelope.contextId) ?? []
      currentActiveContexts.set(sourceKey, [...retained, safeEnvelopeToStore])
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
      Array.from(currentActiveContexts, ([sourceKey, messages]) => {
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
