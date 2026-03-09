import type {
  QueryEngineInput,
  QueryEngineOutput,
  QueryScoredRecord,
} from '../contracts/v1'
import type { MemoryEmbeddingProvider } from '../ports/embedding-provider'
import type { ShortTermMemoryActivityStore } from '../ports/short-term-memory-activity-store'
import type { ShortTermMemoryReader } from '../ports/short-term-memory-reader'
import type { MemoryTokenEstimator } from '../ports/token-estimator'

import {
  alayaSchemaVersion,
  defaultQueryBudget,
  defaultQueryOptions,
} from '../contracts/v1'
import { assembleRecallContext } from './assemble-recall-context'
import { recallShortTermCandidates } from './recall-short-term-candidates'
import { scoreShortTermCandidates } from './score-short-term-candidates'
import { selectShortTermCandidates } from './select-short-term-candidates'

export interface RunQueryEngineDeps {
  shortTermReader: ShortTermMemoryReader
  activityStore?: ShortTermMemoryActivityStore
  embedding?: MemoryEmbeddingProvider
  tokenEstimator?: MemoryTokenEstimator
}

const defaultTokenEstimator: MemoryTokenEstimator = {
  estimate(input) {
    return Math.max(1, Math.ceil(input.text.length / 4))
  },
}

function normalizeBudget(input: QueryEngineInput['budget']) {
  const maxSelected = Number.isFinite(input.maxSelected)
    ? Math.max(1, Math.floor(input.maxSelected))
    : defaultQueryBudget.maxSelected
  const maxContextTokens = Number.isFinite(input.maxContextTokens)
    ? Math.max(1, Math.floor(input.maxContextTokens))
    : defaultQueryBudget.maxContextTokens
  const maxSummaryCharsPerRecord = Number.isFinite(input.maxSummaryCharsPerRecord)
    ? Math.max(8, Math.floor(input.maxSummaryCharsPerRecord))
    : defaultQueryBudget.maxSummaryCharsPerRecord

  return {
    maxSelected,
    maxContextTokens,
    maxSummaryCharsPerRecord,
  }
}

function toOutput(params: {
  input: QueryEngineInput
  startedAt: number
  recalled?: QueryScoredRecord[]
  selected?: QueryScoredRecord[]
  contextText?: string
  contextEstimatedTokens?: number
  metrics?: Partial<QueryEngineOutput['metrics']>
  errors?: QueryEngineOutput['errors']
}): QueryEngineOutput {
  return {
    schemaVersion: alayaSchemaVersion,
    scope: params.input.scope,
    query: params.input.query,
    recalled: params.recalled ?? [],
    selected: params.selected ?? [],
    context: {
      text: params.contextText ?? '',
      estimatedTokens: params.contextEstimatedTokens ?? 0,
    },
    metrics: {
      elapsedMs: Date.now() - params.startedAt,
      scannedRecords: params.metrics?.scannedRecords ?? 0,
      selectedRecords: params.metrics?.selectedRecords ?? 0,
      vectorScoredRecords: params.metrics?.vectorScoredRecords ?? 0,
      keywordScoredRecords: params.metrics?.keywordScoredRecords ?? 0,
      thresholdRejectedRecords: params.metrics?.thresholdRejectedRecords ?? 0,
      accessUpdatedRecords: params.metrics?.accessUpdatedRecords ?? 0,
      queryEmbeddingGenerated: params.metrics?.queryEmbeddingGenerated ?? false,
      queryEmbeddingModel: params.metrics?.queryEmbeddingModel,
      queryEmbeddingDimension: params.metrics?.queryEmbeddingDimension,
    },
    errors: params.errors ?? [],
  }
}

function toQueryScoredRecord(
  input: {
    record: {
      memoryId: string
      workspaceId: string
      sessionId?: string
      summary: string
      category: QueryScoredRecord['category']
      tags: QueryScoredRecord['tags']
      importance: number
      durability: number
      emotionIntensity: number
      retentionReason: QueryScoredRecord['retentionReason']
      eventAt: number
      updatedAt: number
      lastAccessedAt: number
      accessCount: number
      metadata: {
        emotion?: QueryScoredRecord['emotion']
      }
    }
    matchMode: QueryScoredRecord['matchMode']
    similarity: number
    timeWeight: number
    emotionWeight: number
    score: number
  },
  estimatedTokens: number,
): QueryScoredRecord {
  return {
    memoryId: input.record.memoryId,
    workspaceId: input.record.workspaceId,
    sessionId: input.record.sessionId,
    summary: input.record.summary,
    category: input.record.category,
    tags: input.record.tags,
    importance: input.record.importance,
    durability: input.record.durability,
    emotionIntensity: input.record.emotionIntensity,
    retentionReason: input.record.retentionReason,
    eventAt: input.record.eventAt,
    updatedAt: input.record.updatedAt,
    lastAccessedAt: input.record.lastAccessedAt,
    accessCount: input.record.accessCount,
    emotion: input.record.metadata.emotion,
    matchMode: input.matchMode,
    similarity: input.similarity,
    timeWeight: input.timeWeight,
    emotionWeight: input.emotionWeight,
    score: input.score,
    estimatedTokens,
  }
}

async function markSelectedRecordsAccessed(
  input: QueryEngineInput,
  deps: RunQueryEngineDeps,
  selectedMemoryIds: string[],
  errors: QueryEngineOutput['errors'],
) {
  if (!deps.activityStore || selectedMemoryIds.length === 0)
    return 0

  try {
    return await deps.activityStore.markAccessed({
      workspaceId: input.scope.workspaceId,
      memoryIds: selectedMemoryIds,
      accessedAt: input.now,
    })
  }
  catch (error) {
    errors.push({
      code: 'ALAYA_E_STORE_WRITE_FAILED',
      message: error instanceof Error ? error.message : 'Failed to update short-term memory access metadata',
      retriable: true,
    })
    return 0
  }
}

export async function runQueryEngine(
  input: QueryEngineInput,
  deps: RunQueryEngineDeps,
): Promise<QueryEngineOutput> {
  const startedAt = Date.now()
  const errors: QueryEngineOutput['errors'] = []
  const tokenEstimator = deps.tokenEstimator ?? defaultTokenEstimator

  if (input.schemaVersion !== alayaSchemaVersion) {
    return toOutput({
      input,
      startedAt,
      errors: [{
        code: 'ALAYA_E_SCHEMA_VERSION_UNSUPPORTED',
        message: `Unsupported schema version: ${input.schemaVersion}`,
        retriable: false,
      }],
    })
  }

  const workspaceId = input.scope.workspaceId.trim()
  if (!workspaceId) {
    return toOutput({
      input,
      startedAt,
      errors: [{
        code: 'ALAYA_E_INVALID_INPUT',
        message: 'workspaceId is required',
        retriable: false,
      }],
    })
  }

  if (input.recall.mode !== 'full') {
    errors.push({
      code: 'ALAYA_E_INVALID_INPUT',
      message: `Unsupported recall mode: ${input.recall.mode}`,
      retriable: false,
    })
  }

  const records = await recallShortTermCandidates(input, deps, errors)
  const scored = await scoreShortTermCandidates({
    queryText: input.query.text,
    now: input.now,
    records,
  }, deps, errors)

  const normalizedBudget = normalizeBudget(input.budget)
  const normalizedOptions = {
    includeSummary: input.options?.includeSummary ?? defaultQueryOptions.includeSummary,
  }
  const selected = selectShortTermCandidates({
    scoredCandidates: scored.candidates,
    budget: normalizedBudget,
    options: normalizedOptions,
  }, tokenEstimator, errors)

  const selectedMemoryIds = selected.selected.map(candidate => candidate.record.memoryId)
  const accessUpdatedRecords = await markSelectedRecordsAccessed(input, deps, selectedMemoryIds, errors)
  const assembled = assembleRecallContext(selected.selected)

  const recalledRecords = scored.candidates.map(candidate =>
    toQueryScoredRecord(candidate, Math.max(1, Math.ceil(candidate.record.summary.length / 4))),
  )
  const selectedRecords = selected.selected.map(candidate =>
    toQueryScoredRecord(candidate, candidate.estimatedTokens),
  )

  return toOutput({
    input,
    startedAt,
    recalled: recalledRecords,
    selected: selectedRecords,
    contextText: assembled.text,
    contextEstimatedTokens: assembled.estimatedTokens,
    metrics: {
      scannedRecords: records.length,
      selectedRecords: selectedRecords.length,
      vectorScoredRecords: scored.vectorScoredRecords,
      keywordScoredRecords: scored.keywordScoredRecords,
      thresholdRejectedRecords: selected.thresholdRejectedRecords,
      accessUpdatedRecords,
      queryEmbeddingGenerated: scored.queryEmbeddingGenerated,
      queryEmbeddingModel: scored.queryEmbeddingModel,
      queryEmbeddingDimension: scored.queryEmbeddingDimension,
    },
    errors,
  })
}
