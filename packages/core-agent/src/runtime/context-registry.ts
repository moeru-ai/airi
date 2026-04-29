import type { MetadataEventSource } from '@proj-airi/server-shared/types'

import type { ContextMessage } from '../types/chat'

const CONTEXT_UPDATE_REPLACE_SELF = 'replace-self'
const CONTEXT_UPDATE_APPEND_SELF = 'append-self'

interface EventSourcePayload {
  source?: string
  metadata?: { source?: MetadataEventSource }
}

export interface ContextHistoryEntry extends ContextMessage {
  sourceKey: string
}

export interface ContextRegistry {
  ingest: (envelope: ContextMessage) => void
  reset: () => void
  snapshot: () => Record<string, ContextMessage[]>
  activeContexts: () => Record<string, ContextMessage[]>
  contextHistory: () => ContextHistoryEntry[]
}

interface CreateContextRegistryOptions {
  historyLimit?: number
  getSourceKey?: (event: EventSourcePayload, fallback?: string) => string
}

function formatMetadataSource(source?: MetadataEventSource) {
  if (!source?.plugin)
    return undefined

  const pluginId = source.plugin.id
  const instanceId = source.id

  return instanceId ? `${pluginId}:${instanceId}` : pluginId
}

function defaultGetSourceKey(event: EventSourcePayload, fallback = 'unknown') {
  return (
    formatMetadataSource(event.metadata?.source)
    ?? event.source
    ?? fallback
  )
}

export function createContextRegistry(options: CreateContextRegistryOptions = {}): ContextRegistry {
  const historyLimit = options.historyLimit ?? 400
  const getSourceKey = options.getSourceKey ?? defaultGetSourceKey

  let currentActiveContexts: Record<string, ContextMessage[]> = {}
  let currentContextHistory: ContextHistoryEntry[] = []

  function ingest(envelope: ContextMessage) {
    const sourceKey = getSourceKey(envelope)
    if (!currentActiveContexts[sourceKey]) {
      currentActiveContexts[sourceKey] = []
    }

    const safeEnvelopeToStore = structuredClone(envelope)

    if (envelope.strategy === CONTEXT_UPDATE_REPLACE_SELF) {
      currentActiveContexts[sourceKey] = [safeEnvelopeToStore]
    }
    else if (envelope.strategy === CONTEXT_UPDATE_APPEND_SELF) {
      currentActiveContexts[sourceKey].push(safeEnvelopeToStore)
    }

    currentContextHistory = [
      ...currentContextHistory,
      {
        ...safeEnvelopeToStore,
        sourceKey,
      },
    ].slice(-historyLimit)
  }

  function reset() {
    currentActiveContexts = {}
    currentContextHistory = []
  }

  function snapshot() {
    return structuredClone(currentActiveContexts)
  }

  return {
    ingest,
    reset,
    snapshot,
    activeContexts: () => structuredClone(currentActiveContexts),
    contextHistory: () => [...currentContextHistory],
  }
}
