import type {
  AlayaPlannerTrigger,
  PlannerRunOutput,
} from '@proj-airi/memory-alaya'

import type { PlannerEmbeddingCallTrace } from './alaya/planner-embedding-provider'
import type { PlannerLlmCallTrace } from './alaya/planner-llm-provider'

import {
  alayaSchemaVersion,
  createPlannerEngine,
} from '@proj-airi/memory-alaya'
import { nanoid } from 'nanoid'
import { defineStore, storeToRefs } from 'pinia'
import { ref, watch } from 'vue'

import { alayaShortTermMemoryRepo } from '../../database/repos/alaya-short-term-memory.repo'
import { useMemoryShortTermStore } from '../modules/memory-short-term'
import { usePlannerEmbeddingProvidersStore } from '../planner-embedding-providers'
import { usePlannerProvidersStore } from '../planner-providers'
import { createHeuristicPlannerLlmProvider } from './alaya/heuristic-planner-llm-provider'
import { createPlannerEmbeddingProvider } from './alaya/planner-embedding-provider'
import { createPlannerLlmProvider } from './alaya/planner-llm-provider'
import { createChatSessionWorkspaceMemorySource } from './alaya/workspace-memory-source'
import { useChatSessionStore } from './session-store'

const plannerBudget = {
  maxConversations: 1,
  maxTurns: 120,
  maxPromptTokens: 2400,
  maxSourceRefsPerCandidate: 4,
} as const

interface PlannerRunSummary {
  runId: string
  trigger: AlayaPlannerTrigger
  processedTurns: number
  producedCandidates: number
  droppedCandidates: number
  writeResult?: PlannerRunOutput['writeResult']
  errors: PlannerRunOutput['errors']
}

type PlannerLogStatus = 'skipped_threshold' | 'completed' | 'failed'

interface PlannerRuntimeSnapshot {
  providerId?: string
  model?: string
  enabled: boolean
  baseURLConfigured: boolean
  apiKeyConfigured: boolean
  llmTimeoutMs?: number
  systemPromptChars?: number
  llmMode?: PlannerLlmCallTrace['mode']
  fallbackReason?: PlannerLlmCallTrace['fallbackReason']
  embeddingProviderId?: string
  embeddingModel?: string
  embeddingEnabled: boolean
  embeddingBaseURLConfigured: boolean
  embeddingApiKeyConfigured: boolean
  embeddingTimeoutMs?: number
  embeddingBatchSize?: number
  embeddingMode?: PlannerEmbeddingCallTrace['mode']
}

export interface PlannerRunLogItem {
  id: string
  timestamp: number
  finishedAt?: number
  workspaceId: string
  sessionId: string
  trigger: AlayaPlannerTrigger
  status: PlannerLogStatus
  reason?: string
  roundCount?: number
  roundThreshold?: number
  runId?: string
  processedTurns?: number
  producedCandidates?: number
  droppedCandidates?: number
  metrics?: PlannerRunOutput['metrics']
  writeResult?: PlannerRunOutput['writeResult']
  errors?: PlannerRunOutput['errors']
  runtime: PlannerRuntimeSnapshot
}

const maxRunHistory = 400

export const useChatAlayaPlannerStore = defineStore('chat-alaya-planner', () => {
  const chatSession = useChatSessionStore()
  const plannerProvidersStore = usePlannerProvidersStore()
  const plannerEmbeddingProvidersStore = usePlannerEmbeddingProvidersStore()
  const memoryShortTermStore = useMemoryShortTermStore()
  const { activeSessionId } = storeToRefs(chatSession)
  const {
    plannerModel,
    plannerProvider,
    normalizedPlannerTimeoutMs,
    normalizedPlannerSystemPrompt,
    embeddingEnabled,
    normalizedEmbeddingBatchSize,
    resolvedEmbeddingModel,
    resolvedEmbeddingProvider,
    normalizedEmbeddingTimeoutMs,
  } = storeToRefs(memoryShortTermStore)

  const initialized = ref(false)
  const running = ref(false)
  const lastRunAtByWorkspace = ref<Record<string, number>>({})
  const lastRunByWorkspace = ref<Record<string, PlannerRunSummary>>({})
  const runHistory = ref<PlannerRunLogItem[]>([])
  const scheduledRoundCountByWorkspace = ref<Record<string, number>>({})
  const lastLlmCallTrace = ref<PlannerLlmCallTrace>()
  const lastEmbeddingCallTrace = ref<PlannerEmbeddingCallTrace>()
  const schemaRebuildPending = ref(false)
  let runQueue = Promise.resolve()
  let schemaEnsurePromise: Promise<boolean> | null = null

  const workspaceSource = createChatSessionWorkspaceMemorySource()
  const fallbackLlm = createHeuristicPlannerLlmProvider()

  watch([activeSessionId, schemaRebuildPending], ([sessionId, pending]) => {
    if (!pending || !sessionId)
      return

    schemaRebuildPending.value = false
    void runForSession(sessionId, 'manual')
  }, { immediate: true })

  function resolvePlannerRuntime() {
    const providerId = plannerProvider.value
    const model = plannerModel.value
    const config = providerId
      ? plannerProvidersStore.getProviderConfig(providerId)
      : undefined

    const baseURLRaw = typeof config?.baseUrl === 'string'
      ? config.baseUrl
      : (typeof config?.baseURL === 'string' ? config.baseURL : undefined)
    const apiKeyRaw = typeof config?.apiKey === 'string'
      ? config.apiKey
      : undefined
    const baseURL = baseURLRaw?.trim()
    const apiKey = apiKeyRaw?.trim()
    const rawHeaders = config?.headers
    const headers = rawHeaders && typeof rawHeaders === 'object'
      ? Object.fromEntries(
          Object.entries(rawHeaders as Record<string, unknown>)
            .filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
        )
      : undefined

    return {
      providerId,
      model,
      baseURL,
      apiKey,
      headers,
      enabled: Boolean(model && baseURL),
      timeoutMs: normalizedPlannerTimeoutMs.value,
      systemPrompt: normalizedPlannerSystemPrompt.value,
    }
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

  function runtimeSnapshot(
    llmRuntime = resolvePlannerRuntime(),
    embeddingRuntime = resolveEmbeddingRuntime(),
    llmTrace: PlannerLlmCallTrace | undefined = undefined,
    embeddingTrace: PlannerEmbeddingCallTrace | undefined = undefined,
  ): PlannerRuntimeSnapshot {
    return {
      providerId: llmRuntime.providerId || undefined,
      model: llmRuntime.model || undefined,
      enabled: llmRuntime.enabled,
      baseURLConfigured: Boolean(llmRuntime.baseURL),
      apiKeyConfigured: Boolean(llmRuntime.apiKey),
      llmTimeoutMs: llmRuntime.timeoutMs,
      systemPromptChars: llmRuntime.systemPrompt?.length ?? 0,
      llmMode: llmTrace?.mode,
      fallbackReason: llmTrace?.fallbackReason,
      embeddingProviderId: embeddingRuntime.providerId || undefined,
      embeddingModel: embeddingRuntime.model || undefined,
      embeddingEnabled: embeddingRuntime.enabled,
      embeddingBaseURLConfigured: Boolean(embeddingRuntime.baseURL),
      embeddingApiKeyConfigured: Boolean(embeddingRuntime.apiKey),
      embeddingTimeoutMs: embeddingRuntime.timeoutMs,
      embeddingBatchSize: embeddingRuntime.batchSize,
      embeddingMode: embeddingTrace?.mode,
    }
  }

  function appendRunLog(entry: Omit<PlannerRunLogItem, 'id'>) {
    runHistory.value = [
      {
        ...entry,
        id: nanoid(),
      },
      ...runHistory.value,
    ].slice(0, maxRunHistory)
  }

  const llm = createPlannerLlmProvider({
    fallback: fallbackLlm,
    resolveRuntime() {
      const runtime = resolvePlannerRuntime()
      return {
        enabled: runtime.enabled,
        model: runtime.model,
        baseURL: runtime.baseURL,
        apiKey: runtime.apiKey,
        headers: runtime.headers,
        timeoutMs: runtime.timeoutMs,
        systemPrompt: runtime.systemPrompt,
      }
    },
    onCallTrace(trace) {
      lastLlmCallTrace.value = trace
    },
  })
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
    onCallTrace(trace) {
      lastEmbeddingCallTrace.value = trace
    },
  })

  function toWorkspaceId(sessionId: string) {
    return sessionId
  }

  function enqueueRun(task: () => Promise<void>) {
    runQueue = runQueue.then(task, task)
    return runQueue
  }

  async function ensureSchemaReady() {
    if (schemaEnsurePromise)
      return await schemaEnsurePromise

    schemaEnsurePromise = (async () => {
      const result = await alayaShortTermMemoryRepo.ensureSchemaVersion(alayaSchemaVersion)
      if (result.reset)
        schemaRebuildPending.value = true
      return result.reset
    })()

    try {
      return await schemaEnsurePromise
    }
    finally {
      schemaEnsurePromise = null
    }
  }

  async function evaluateRun(sessionId: string, trigger: AlayaPlannerTrigger) {
    if (!sessionId)
      return

    await ensureSchemaReady()
    const workspaceId = toWorkspaceId(sessionId)
    const now = Date.now()
    const llmRuntime = resolvePlannerRuntime()
    const embeddingRuntime = resolveEmbeddingRuntime()
    const runtimeInfo = runtimeSnapshot(llmRuntime, embeddingRuntime)
    if (trigger === 'scheduled') {
      const currentCount = scheduledRoundCountByWorkspace.value[workspaceId] ?? 0
      const nextCount = currentCount + 1
      const threshold = memoryShortTermStore.normalizedPlannerRoundThreshold
      scheduledRoundCountByWorkspace.value = {
        ...scheduledRoundCountByWorkspace.value,
        [workspaceId]: nextCount,
      }

      if (nextCount < threshold) {
        appendRunLog({
          timestamp: now,
          finishedAt: now,
          workspaceId,
          sessionId,
          trigger,
          status: 'skipped_threshold',
          reason: 'scheduled round threshold not reached',
          roundCount: nextCount,
          roundThreshold: threshold,
          runtime: runtimeInfo,
        })
        return
      }
    }

    running.value = true
    const startedAt = now
    try {
      lastLlmCallTrace.value = undefined
      lastEmbeddingCallTrace.value = undefined
      const checkpoint = await alayaShortTermMemoryRepo.getCheckpoint(workspaceId)
      const effectiveBudget = trigger === 'scheduled'
        ? {
            ...plannerBudget,
            maxTurns: Math.min(
              plannerBudget.maxTurns,
              Math.max(2, memoryShortTermStore.normalizedPlannerRoundThreshold * 2),
            ),
          }
        : plannerBudget
      const planner = createPlannerEngine({
        workspaceSource,
        shortTermStore: alayaShortTermMemoryRepo,
        llm,
        embedding: embeddingRuntime.enabled ? embedding : undefined,
      })
      const output = await planner.run({
        schemaVersion: alayaSchemaVersion,
        runId: `alaya-planner-${nanoid()}`,
        trigger,
        now,
        scope: {
          workspaceId,
          sessionId,
          conversationIds: [sessionId],
        },
        checkpoint,
        budget: effectiveBudget,
      })

      lastRunAtByWorkspace.value = {
        ...lastRunAtByWorkspace.value,
        [workspaceId]: now,
      }
      lastRunByWorkspace.value = {
        ...lastRunByWorkspace.value,
        [workspaceId]: {
          runId: output.runId,
          trigger: output.trigger,
          processedTurns: output.processedTurns,
          producedCandidates: output.producedCandidates,
          droppedCandidates: output.droppedCandidates,
          writeResult: output.writeResult,
          errors: output.errors,
        },
      }

      scheduledRoundCountByWorkspace.value = {
        ...scheduledRoundCountByWorkspace.value,
        [workspaceId]: 0,
      }

      appendRunLog({
        timestamp: startedAt,
        finishedAt: Date.now(),
        workspaceId,
        sessionId,
        trigger,
        status: 'completed',
        runId: output.runId,
        processedTurns: output.processedTurns,
        producedCandidates: output.producedCandidates,
        droppedCandidates: output.droppedCandidates,
        metrics: output.metrics,
        writeResult: output.writeResult,
        errors: output.errors,
        roundCount: 0,
        roundThreshold: memoryShortTermStore.normalizedPlannerRoundThreshold,
        runtime: runtimeSnapshot(
          llmRuntime,
          embeddingRuntime,
          lastLlmCallTrace.value,
          lastEmbeddingCallTrace.value,
        ),
      })

      if (output.errors.length > 0) {
        console.warn('Alaya planner run completed with errors', {
          workspaceId,
          runId: output.runId,
          errors: output.errors,
        })
      }
    }
    catch (error) {
      appendRunLog({
        timestamp: startedAt,
        finishedAt: Date.now(),
        workspaceId,
        sessionId,
        trigger,
        status: 'failed',
        reason: error instanceof Error ? error.message : String(error),
        roundCount: scheduledRoundCountByWorkspace.value[workspaceId] ?? 0,
        roundThreshold: memoryShortTermStore.normalizedPlannerRoundThreshold,
        runtime: runtimeSnapshot(
          llmRuntime,
          embeddingRuntime,
          lastLlmCallTrace.value,
          lastEmbeddingCallTrace.value,
        ),
      })
      console.warn('Alaya planner run failed', { sessionId, trigger, error })
    }
    finally {
      running.value = false
    }
  }

  async function runForSession(sessionId: string, trigger: AlayaPlannerTrigger) {
    await enqueueRun(async () => {
      await evaluateRun(sessionId, trigger)
    })
  }

  async function runForActiveSession(trigger: AlayaPlannerTrigger = 'manual') {
    const sessionId = activeSessionId.value
    if (!sessionId)
      return
    await runForSession(sessionId, trigger)
  }

  async function onChatTurnCompleted(sessionId: string) {
    await runForSession(sessionId, 'scheduled')
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
    lastRunByWorkspace,
    runHistory,
    scheduledRoundCountByWorkspace,
    initialize,
    clearRunHistory,
    runForActiveSession,
    onChatTurnCompleted,
  }
})
