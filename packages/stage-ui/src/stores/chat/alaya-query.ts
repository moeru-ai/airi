import type { QueryEngineOutput } from '@proj-airi/memory-alaya'

import {
  alayaSchemaVersion,
  createQueryEngine,
} from '@proj-airi/memory-alaya'
import { nanoid } from 'nanoid'
import { defineStore, storeToRefs } from 'pinia'
import { ref } from 'vue'

import { alayaShortTermMemoryRepo } from '../../database/repos/alaya-short-term-memory.repo'
import { useMemoryShortTermStore } from '../modules/memory-short-term'
import { usePlannerEmbeddingProvidersStore } from '../planner-embedding-providers'
import { createPlannerEmbeddingProvider } from './alaya/planner-embedding-provider'
import { createAlayaShortTermMemoryReader } from './alaya/short-term-memory-reader'

const queryBudget = {
  maxSelected: 8,
  maxContextTokens: 900,
  maxSummaryCharsPerRecord: 280,
} as const

const queryOptions = {
  includeSummary: true,
} as const

type QueryLogStatus = 'skipped' | 'completed' | 'failed'

interface QueryRuntimeSnapshot {
  embeddingEnabled: boolean
  embeddingProviderId?: string
  embeddingModel?: string
  embeddingBaseURLConfigured: boolean
  embeddingApiKeyConfigured: boolean
  embeddingTimeoutMs?: number
  embeddingBatchSize?: number
}

export interface QueryRunLogItem {
  id: string
  timestamp: number
  finishedAt?: number
  workspaceId: string
  sessionId: string
  status: QueryLogStatus
  reason?: string
  queryText: string
  queryChars: number
  contextChars?: number
  contextTokens?: number
  selectedMemoryIds?: string[]
  injectedContextPreview?: string
  metrics?: QueryEngineOutput['metrics']
  errors?: QueryEngineOutput['errors']
  runtime: QueryRuntimeSnapshot
}

const maxRunHistory = 400

export const useChatAlayaQueryStore = defineStore('chat-alaya-query', () => {
  const plannerEmbeddingProvidersStore = usePlannerEmbeddingProvidersStore()
  const memoryShortTermStore = useMemoryShortTermStore()
  const {
    embeddingEnabled,
    normalizedEmbeddingBatchSize,
    resolvedEmbeddingModel,
    resolvedEmbeddingProvider,
    normalizedEmbeddingTimeoutMs,
  } = storeToRefs(memoryShortTermStore)

  const initialized = ref(false)
  const running = ref(false)
  const lastRunAtByWorkspace = ref<Record<string, number>>({})
  const lastRecallByWorkspace = ref<Record<string, QueryEngineOutput>>({})
  const lastErrorByWorkspace = ref<Record<string, string | undefined>>({})
  const runHistory = ref<QueryRunLogItem[]>([])
  let schemaEnsurePromise: Promise<void> | null = null

  const shortTermReader = createAlayaShortTermMemoryReader()

  function toWorkspaceId(sessionId: string) {
    return sessionId
  }

  function appendRunLog(entry: Omit<QueryRunLogItem, 'id'>) {
    runHistory.value = [
      {
        ...entry,
        id: nanoid(),
      },
      ...runHistory.value,
    ].slice(0, maxRunHistory)
  }

  function resolveEmbeddingRuntime() {
    const providerId = resolvedEmbeddingProvider.value
    const model = resolvedEmbeddingModel.value
    const config = providerId
      ? plannerEmbeddingProvidersStore.getProviderConfig(providerId)
      : undefined
    const configBaseURLRaw = typeof config?.baseUrl === 'string'
      ? config.baseUrl
      : (typeof config?.baseURL === 'string' ? config.baseURL : undefined)
    const baseURL = configBaseURLRaw?.trim()
    const apiKey = typeof config?.apiKey === 'string' ? config.apiKey.trim() : undefined
    const rawHeaders = config?.headers
    const headers = rawHeaders && typeof rawHeaders === 'object'
      ? Object.fromEntries(
          Object.entries(rawHeaders as Record<string, unknown>)
            .filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
        )
      : undefined

    const maxBatchSizeByProvider = providerId === 'planner-embedding-alibaba'
      ? 10
      : 64

    return {
      providerId,
      model,
      baseURL,
      apiKey,
      headers,
      enabled: Boolean(embeddingEnabled.value && providerId && model && baseURL),
      timeoutMs: normalizedEmbeddingTimeoutMs.value,
      batchSize: Math.min(normalizedEmbeddingBatchSize.value, maxBatchSizeByProvider),
    }
  }

  function runtimeSnapshot(embeddingRuntime = resolveEmbeddingRuntime()): QueryRuntimeSnapshot {
    return {
      embeddingEnabled: embeddingRuntime.enabled,
      embeddingProviderId: embeddingRuntime.providerId || undefined,
      embeddingModel: embeddingRuntime.model || undefined,
      embeddingBaseURLConfigured: Boolean(embeddingRuntime.baseURL),
      embeddingApiKeyConfigured: Boolean(embeddingRuntime.apiKey),
      embeddingTimeoutMs: embeddingRuntime.timeoutMs,
      embeddingBatchSize: embeddingRuntime.batchSize,
    }
  }

  const embedding = createPlannerEmbeddingProvider({
    resolveRuntime() {
      const runtime = resolveEmbeddingRuntime()
      return {
        enabled: runtime.enabled,
        providerId: runtime.providerId,
        model: runtime.model,
        baseURL: runtime.baseURL,
        apiKey: runtime.apiKey,
        headers: runtime.headers,
        timeoutMs: runtime.timeoutMs,
        batchSize: runtime.batchSize,
      }
    },
    async getProviderInstance(providerId) {
      return await plannerEmbeddingProvidersStore.getProviderInstance(providerId)
    },
  })

  async function ensureSchemaReady() {
    if (schemaEnsurePromise)
      return await schemaEnsurePromise

    schemaEnsurePromise = alayaShortTermMemoryRepo.ensureSchemaVersion(alayaSchemaVersion)
      .then(() => {})
      .finally(() => {
        schemaEnsurePromise = null
      })

    return await schemaEnsurePromise
  }

  async function buildRecallContextForSession(sessionId: string, queryText: string) {
    const trimmedQueryText = queryText.trim()
    if (!sessionId)
      return undefined

    if (!trimmedQueryText) {
      const now = Date.now()
      appendRunLog({
        timestamp: now,
        finishedAt: now,
        workspaceId: toWorkspaceId(sessionId),
        sessionId,
        status: 'skipped',
        reason: 'query text is empty',
        queryText: '',
        queryChars: 0,
        runtime: runtimeSnapshot(),
      })
      return undefined
    }

    running.value = true
    const workspaceId = toWorkspaceId(sessionId)
    const now = Date.now()
    const startedAt = now
    const embeddingRuntime = resolveEmbeddingRuntime()
    const runtime = runtimeSnapshot(embeddingRuntime)

    try {
      await ensureSchemaReady()
      const queryEngine = createQueryEngine({
        shortTermReader,
        activityStore: alayaShortTermMemoryRepo,
        embedding: embeddingRuntime.enabled ? embedding : undefined,
        tokenEstimator: {
          estimate({ text }: { text: string }) {
            return Math.max(1, Math.ceil(text.length / 4))
          },
        },
      })

      const output = await queryEngine.execute({
        schemaVersion: alayaSchemaVersion,
        now,
        scope: {
          workspaceId,
          sessionId,
        },
        query: {
          text: trimmedQueryText,
        },
        recall: {
          mode: 'full',
        },
        budget: queryBudget,
        options: queryOptions,
      })

      lastRunAtByWorkspace.value = {
        ...lastRunAtByWorkspace.value,
        [workspaceId]: now,
      }
      lastRecallByWorkspace.value = {
        ...lastRecallByWorkspace.value,
        [workspaceId]: output,
      }
      lastErrorByWorkspace.value = {
        ...lastErrorByWorkspace.value,
        [workspaceId]: output.errors[0]?.message,
      }

      appendRunLog({
        timestamp: startedAt,
        finishedAt: Date.now(),
        workspaceId,
        sessionId,
        status: 'completed',
        queryText: trimmedQueryText,
        queryChars: trimmedQueryText.length,
        contextChars: output.context.text.length,
        contextTokens: output.context.estimatedTokens,
        selectedMemoryIds: output.selected.map(item => item.memoryId),
        injectedContextPreview: output.context.text,
        metrics: output.metrics,
        errors: output.errors,
        runtime,
      })

      return output.context.text || undefined
    }
    catch (error) {
      lastErrorByWorkspace.value = {
        ...lastErrorByWorkspace.value,
        [workspaceId]: error instanceof Error ? error.message : String(error),
      }

      appendRunLog({
        timestamp: startedAt,
        finishedAt: Date.now(),
        workspaceId,
        sessionId,
        status: 'failed',
        reason: error instanceof Error ? error.message : String(error),
        queryText: trimmedQueryText,
        queryChars: trimmedQueryText.length,
        runtime,
      })
      return undefined
    }
    finally {
      running.value = false
    }
  }

  function initialize() {
    if (initialized.value)
      return
    initialized.value = true
    void ensureSchemaReady()
  }

  function clearRunHistory() {
    runHistory.value = []
  }

  return {
    initialized,
    running,
    lastRunAtByWorkspace,
    lastRecallByWorkspace,
    lastErrorByWorkspace,
    runHistory,
    initialize,
    clearRunHistory,
    buildRecallContextForSession,
  }
})
