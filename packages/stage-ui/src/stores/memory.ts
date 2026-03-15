import type {
  MemoryConsolidateRequestEvent,
  MemoryConsolidateResultEvent,
  MemoryDeleteEvent,
  MemoryDeleteResultEvent,
  MemoryIngestChatTurnEvent,
  MemoryIngestChatTurnResultEvent,
  MemoryScope,
  MemorySearchRequestEvent,
  MemorySearchResponseEvent,
  MemoryStatsRequestEvent,
  MemoryStatsResponseEvent,
  MemoryUpsertEvent,
  MemoryUpsertResultEvent,
  MetadataEventSource,
} from '@proj-airi/server-sdk'

import type { ContextMessage } from '../types/chat'

import { ContextUpdateStrategy } from '@proj-airi/server-sdk'
import { useLocalStorage } from '@vueuse/core'
import { nanoid } from 'nanoid'
import { defineStore } from 'pinia'
import { ref } from 'vue'

import { useChatContextStore } from './chat/context-store'
import { useModsServerChannelStore } from './mods/api/channel-server'

interface Deferred<T> {
  resolve: (value: T) => void
  reject: (reason?: unknown) => void
  timeout: ReturnType<typeof setTimeout>
}

const MEMORY_CONTEXT_SOURCE: MetadataEventSource = {
  kind: 'plugin',
  id: 'stage-ui-memory-bridge',
  plugin: {
    id: 'memory-pgvector',
  },
}
const MEMORY_CONTEXT_SOURCE_KEY = 'memory-pgvector:stage-ui-memory-bridge'

export const useMemoryStore = defineStore('memory', () => {
  const modsServerChannelStore = useModsServerChannelStore()
  const chatContextStore = useChatContextStore()

  const initialized = ref(false)
  const initializing = ref<Promise<void> | null>(null)
  const memoryEnabled = useLocalStorage('settings/memory/enabled', true)
  const autoRecallEnabled = useLocalStorage('settings/memory/auto-recall', true)
  const autoIngestEnabled = useLocalStorage('settings/memory/auto-ingest', true)
  const autoConsolidateEnabled = useLocalStorage('settings/memory/auto-consolidate', true)
  const consolidateCooldownMs = useLocalStorage('settings/memory/consolidate-cooldown-ms', 45_000)
  const requestTimeoutMs = useLocalStorage('settings/memory/request-timeout-ms', 3500)
  const lastConsolidatedAt = useLocalStorage<Record<string, number>>('settings/memory/last-consolidated-at', {})

  const recalling = ref(false)
  const ingesting = ref(false)
  const consolidating = ref(false)
  const lastSearchResponse = ref<MemorySearchResponseEvent | null>(null)
  const lastStatsResponse = ref<MemoryStatsResponseEvent | null>(null)
  const lastConsolidateResponse = ref<MemoryConsolidateResultEvent | null>(null)
  const lastError = ref<string | null>(null)

  const searchRequests = new Map<string, Deferred<MemorySearchResponseEvent>>()
  const upsertRequests = new Map<string, Deferred<MemoryUpsertResultEvent>>()
  const ingestRequests = new Map<string, Deferred<MemoryIngestChatTurnResultEvent>>()
  const deleteRequests = new Map<string, Deferred<MemoryDeleteResultEvent>>()
  const statsRequests = new Map<string, Deferred<MemoryStatsResponseEvent>>()
  const consolidateRequests = new Map<string, Deferred<MemoryConsolidateResultEvent>>()

  function clearDeferred<T>(map: Map<string, Deferred<T>>, requestId: string, value?: T, error?: unknown) {
    const deferred = map.get(requestId)
    if (!deferred) {
      return
    }

    clearTimeout(deferred.timeout)
    map.delete(requestId)

    if (error) {
      deferred.reject(error)
    }
    else if (value !== undefined) {
      deferred.resolve(value)
    }
  }

  function createDeferred<T>(map: Map<string, Deferred<T>>, requestId: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        map.delete(requestId)
        reject(new Error(`Memory request timed out: ${requestId}`))
      }, requestTimeoutMs.value)

      map.set(requestId, { resolve, reject, timeout })
    })
  }

  function convertSearchResponseToContext(response: MemorySearchResponseEvent, options?: { strategy?: ContextUpdateStrategy, lane?: string }): ContextMessage {
    const createdAt = Date.now()

    return {
      id: `memory-context:${response.requestId}`,
      contextId: 'memory:auto-recall',
      lane: options?.lane || 'memory',
      strategy: options?.strategy || ContextUpdateStrategy.ReplaceSelf,
      text: [
        `Recalled memories for: ${response.query}`,
        ...response.results.map((result, index) => `${index + 1}. [${result.item.kind}] ${result.item.summary || result.item.content}`),
      ].join('\n'),
      ideas: response.results.slice(0, 3).map(result => result.item.summary || result.item.content),
      hints: Array.from(new Set(response.results.flatMap(result => result.item.tags))).slice(0, 12),
      content: JSON.stringify(response.results.map(result => ({
        id: result.item.id,
        kind: result.item.kind,
        score: result.score,
        summary: result.item.summary,
        content: result.item.content,
        tags: result.item.tags,
      }))),
      metadata: {
        source: MEMORY_CONTEXT_SOURCE,
      },
      createdAt,
    }
  }

  async function initialize() {
    if (initialized.value) {
      return
    }
    if (initializing.value) {
      return initializing.value
    }

    initializing.value = (async () => {
      await modsServerChannelStore.ensureConnected()

      modsServerChannelStore.onEvent('memory:search:response', (event) => {
        lastSearchResponse.value = event.data
        clearDeferred(searchRequests, event.data.requestId, event.data)
      })

      modsServerChannelStore.onEvent('memory:upsert:result', (event) => {
        if (event.data.requestId)
          clearDeferred(upsertRequests, event.data.requestId, event.data)
      })

      modsServerChannelStore.onEvent('memory:ingest:chat-turn:result', (event) => {
        if (event.data.requestId)
          clearDeferred(ingestRequests, event.data.requestId, event.data)
      })

      modsServerChannelStore.onEvent('memory:delete:result', (event) => {
        if (event.data.requestId)
          clearDeferred(deleteRequests, event.data.requestId, event.data)
      })

      modsServerChannelStore.onEvent('memory:stats:response', (event) => {
        lastStatsResponse.value = event.data
        clearDeferred(statsRequests, event.data.requestId, event.data)
      })

      modsServerChannelStore.onEvent('memory:consolidate:result', (event) => {
        lastConsolidateResponse.value = event.data
        clearDeferred(consolidateRequests, event.data.requestId, event.data)
      })

      initialized.value = true
    })()

    try {
      await initializing.value
    }
    finally {
      initializing.value = null
    }
  }

  async function search(request: Omit<MemorySearchRequestEvent, 'requestId'> & { requestId?: string }) {
    await initialize()

    const requestId = request.requestId || nanoid()
    const responsePromise = createDeferred(searchRequests, requestId)

    modsServerChannelStore.send({
      type: 'memory:search:request',
      data: {
        requestId,
        ...request,
      },
    })

    return await responsePromise
  }

  async function upsert(event: Omit<MemoryUpsertEvent, 'requestId'> & { requestId?: string }) {
    await initialize()

    const requestId = event.requestId || nanoid()
    const responsePromise = createDeferred(upsertRequests, requestId)

    modsServerChannelStore.send({
      type: 'memory:upsert',
      data: {
        requestId,
        ...event,
      },
    })

    return await responsePromise
  }

  async function ingestChatTurn(event: Omit<MemoryIngestChatTurnEvent, 'requestId'> & { requestId?: string }) {
    await initialize()

    const requestId = event.requestId || nanoid()
    const responsePromise = createDeferred(ingestRequests, requestId)

    modsServerChannelStore.send({
      type: 'memory:ingest:chat-turn',
      data: {
        requestId,
        ...event,
      },
    })

    return await responsePromise
  }

  async function deleteMemories(event: Omit<MemoryDeleteEvent, 'requestId'> & { requestId?: string }) {
    await initialize()

    const requestId = event.requestId || nanoid()
    const responsePromise = createDeferred(deleteRequests, requestId)

    modsServerChannelStore.send({
      type: 'memory:delete',
      data: {
        requestId,
        ...event,
      },
    })

    return await responsePromise
  }

  async function fetchStats(event?: Omit<MemoryStatsRequestEvent, 'requestId'> & { requestId?: string }) {
    await initialize()

    const requestId = event?.requestId || nanoid()
    const responsePromise = createDeferred(statsRequests, requestId)

    modsServerChannelStore.send({
      type: 'memory:stats:request',
      data: {
        requestId,
        ...event,
      },
    })

    return await responsePromise
  }

  async function consolidate(event?: Omit<MemoryConsolidateRequestEvent, 'requestId'> & { requestId?: string }) {
    await initialize()

    const requestId = event?.requestId || nanoid()
    const responsePromise = createDeferred(consolidateRequests, requestId)

    modsServerChannelStore.send({
      type: 'memory:consolidate:request',
      data: {
        requestId,
        ...event,
      },
    })

    return await responsePromise
  }

  async function maybeConsolidateScope(options: {
    scope: MemoryScope
    force?: boolean
    archiveEpisodic?: boolean
  }) {
    if (!memoryEnabled.value || !autoConsolidateEnabled.value) {
      return null
    }

    const scopeKey = JSON.stringify(options.scope)
    const lastRunAt = lastConsolidatedAt.value[scopeKey] || 0
    if (!options.force && Date.now() - lastRunAt < consolidateCooldownMs.value) {
      return null
    }

    consolidating.value = true
    lastError.value = null

    try {
      const response = await consolidate({
        filters: {
          scope: options.scope,
          archived: false,
        },
        archiveEpisodic: options.archiveEpisodic,
      })

      lastConsolidatedAt.value = {
        ...lastConsolidatedAt.value,
        [scopeKey]: Date.now(),
      }

      return response
    }
    catch (error) {
      lastError.value = error instanceof Error ? error.message : String(error)
      return null
    }
    finally {
      consolidating.value = false
    }
  }

  async function recallIntoContext(options: {
    query: string
    scope: MemoryScope
    limit?: number
    minScore?: number
    lane?: string
  }) {
    if (!memoryEnabled.value || !autoRecallEnabled.value || !options.query.trim()) {
      chatContextStore.clearContextsBySource(MEMORY_CONTEXT_SOURCE_KEY)
      return null
    }

    recalling.value = true
    lastError.value = null

    try {
      const response = await search({
        query: options.query,
        limit: options.limit ?? 6,
        minScore: options.minScore,
        filters: {
          scope: options.scope,
          archived: false,
        },
      })

      if (response.results.length > 0) {
        chatContextStore.ingestContextMessage(convertSearchResponseToContext(response, {
          lane: options.lane,
        }))
      }
      else {
        chatContextStore.clearContextsBySource(MEMORY_CONTEXT_SOURCE_KEY)
      }

      return response
    }
    catch (error) {
      lastError.value = error instanceof Error ? error.message : String(error)
      chatContextStore.clearContextsBySource(MEMORY_CONTEXT_SOURCE_KEY)
      return null
    }
    finally {
      recalling.value = false
    }
  }

  async function rememberChatTurn(event: {
    scope: MemoryScope
    userMessage?: string
    assistantMessage?: string
    explicit?: boolean
    tags?: string[]
    metadata?: Record<string, unknown>
  }) {
    if (!memoryEnabled.value || !autoIngestEnabled.value) {
      return null
    }

    if (!event.userMessage?.trim() && !event.assistantMessage?.trim()) {
      return null
    }

    ingesting.value = true
    lastError.value = null

    try {
      const result = await ingestChatTurn(event)
      if (result.created.length > 0 || result.updated.length > 0 || result.merged.length > 0) {
        void maybeConsolidateScope({
          scope: event.scope,
        })
      }

      return result
    }
    catch (error) {
      lastError.value = error instanceof Error ? error.message : String(error)
      return null
    }
    finally {
      ingesting.value = false
    }
  }

  return {
    initialized,
    memoryEnabled,
    autoRecallEnabled,
    autoIngestEnabled,
    autoConsolidateEnabled,
    consolidateCooldownMs,
    requestTimeoutMs,
    recalling,
    ingesting,
    consolidating,
    lastSearchResponse,
    lastStatsResponse,
    lastConsolidateResponse,
    lastError,
    initialize,
    search,
    upsert,
    ingestChatTurn,
    deleteMemories,
    fetchStats,
    consolidate,
    maybeConsolidateScope,
    clearRecallContext: () => chatContextStore.clearContextsBySource(MEMORY_CONTEXT_SOURCE_KEY),
    recallIntoContext,
    rememberChatTurn,
  }
})
