import type {
  PlannerCandidate,
  PlannerCheckpoint,
  PlannerExtractionFromLlm,
  PlannerRunInput,
  PlannerRunOutput,
  PlannerSourceRef,
  ShortTermMemoryRecord,
  WorkspaceTurn,
} from '../contracts/v1'
import type { MemoryEmbeddingProvider } from '../ports/embedding-provider'
import type { MemoryLlmProvider } from '../ports/llm-provider'
import type { PlannerObserver } from '../ports/planner-observer'
import type { ShortTermMemoryStore } from '../ports/short-term-memory-store'
import type { WorkspaceMemorySource } from '../ports/workspace-memory-source'

import { safeParse } from 'valibot'

import {
  alayaMemoryCategories,
  alayaRetentionReasons,
  alayaSchemaVersion,
  plannerExtractionSchema,
} from '../contracts/v1'
import { hashStringFNV1a } from '../utils/hash'

export interface RunPlannerBatchDeps {
  workspaceSource: WorkspaceMemorySource
  shortTermStore: ShortTermMemoryStore
  llm: MemoryLlmProvider
  embedding?: MemoryEmbeddingProvider
  observer?: PlannerObserver
  hashText?: (input: string) => string
}

const baseHalfLifeDaysByRetentionReason: Record<PlannerCandidate['retentionReason'], number> = {
  identity: 84,
  stable_preference: 42,
  boundary: 72,
  relationship_anchor: 45,
  ongoing_task: 14,
  recurring_pattern: 28,
  emotional_peak: 18,
  assistant_commitment: 18,
  key_event: 12,
}

function clamp01(input: number) {
  if (!Number.isFinite(input))
    return 0
  return Math.max(0, Math.min(1, input))
}

function resolveHalfLifeDays(candidate: PlannerCandidate) {
  const base = baseHalfLifeDaysByRetentionReason[candidate.retentionReason] ?? 21
  const durabilityBoost = Math.round((clamp01(candidate.durability) - 0.5) * 28)
  const importanceBoost = Math.round(((candidate.importance - 1) / 9) * 10)
  const emotionBoost = candidate.emotionIntensity >= 0.75 ? 4 : 0

  return Math.max(3, Math.min(120, base + durabilityBoost + importanceBoost + emotionBoost))
}

export async function runPlannerBatch(
  input: PlannerRunInput,
  deps: RunPlannerBatchDeps,
): Promise<PlannerRunOutput> {
  const startedAt = Date.now()
  const hashText = deps.hashText ?? hashStringFNV1a
  const errors: PlannerRunOutput['errors'] = []
  const baseMetrics: PlannerRunOutput['metrics'] = {
    elapsedMs: 0,
    embeddingCount: 0,
  }

  await deps.observer?.onStart?.(input)

  if (input.schemaVersion !== alayaSchemaVersion) {
    const output = createOutput({
      input,
      startedAt,
      errors: [{
        code: 'ALAYA_E_SCHEMA_VERSION_UNSUPPORTED',
        message: `Unsupported schema version: ${input.schemaVersion}`,
        retriable: false,
      }],
    })
    await deps.observer?.onFinish?.(output)
    return output
  }

  const checkpoint = await resolveCheckpoint(input, deps.shortTermStore, errors)
  const turnsResult = await loadTurns(input, checkpoint, deps.workspaceSource, errors)

  if (turnsResult.turns.length === 0) {
    const output = createOutput({
      input,
      startedAt,
      errors,
      nextCheckpoint: checkpoint,
      metrics: baseMetrics,
    })
    await deps.observer?.onFinish?.(output)
    return output
  }

  const extraction = await extractCandidates(input, turnsResult.turns, deps.llm, errors)
  if (!extraction) {
    const output = createOutput({
      input,
      startedAt,
      errors,
      processedTurns: turnsResult.turns.length,
      metrics: baseMetrics,
    })
    await deps.observer?.onFinish?.(output)
    return output
  }

  baseMetrics.llmPromptTokens = extraction.usage?.promptTokens
  baseMetrics.llmCompletionTokens = extraction.usage?.completionTokens

  const normalizedCandidates = normalizeCandidates(
    extraction,
    input,
    hashText,
  )

  const records = buildShortTermRecords(input, normalizedCandidates, hashText)
  await attachEmbeddings(records, deps.embedding, errors, baseMetrics)

  let writeResult: PlannerRunOutput['writeResult']
  let writeSucceeded = true
  if (!input.dryRun) {
    try {
      writeResult = await deps.shortTermStore.upsert(records, { runId: input.runId })
    }
    catch (error) {
      writeSucceeded = false
      errors.push({
        code: 'ALAYA_E_STORE_WRITE_FAILED',
        message: error instanceof Error ? error.message : 'Failed to upsert short-term records',
        retriable: true,
      })
    }
  }

  const nextCheckpoint = createNextCheckpoint(input, turnsResult, turnsResult.turns)
  if (!input.dryRun && writeSucceeded && nextCheckpoint) {
    try {
      await deps.shortTermStore.saveCheckpoint(nextCheckpoint)
    }
    catch (error) {
      errors.push({
        code: 'ALAYA_E_STORE_WRITE_FAILED',
        message: error instanceof Error ? error.message : 'Failed to save planner checkpoint',
        retriable: true,
      })
    }
  }

  const output = createOutput({
    input,
    startedAt,
    errors,
    processedTurns: turnsResult.turns.length,
    producedCandidates: normalizedCandidates.length,
    droppedCandidates: extraction.candidates.length - normalizedCandidates.length,
    candidates: normalizedCandidates,
    records,
    writeResult,
    nextCheckpoint,
    metrics: baseMetrics,
  })

  await deps.observer?.onFinish?.(output)
  return output
}

function createOutput(params: {
  input: PlannerRunInput
  startedAt: number
  errors: PlannerRunOutput['errors']
  processedTurns?: number
  producedCandidates?: number
  droppedCandidates?: number
  candidates?: PlannerCandidate[]
  records?: ShortTermMemoryRecord[]
  writeResult?: PlannerRunOutput['writeResult']
  nextCheckpoint?: PlannerCheckpoint
  metrics?: PlannerRunOutput['metrics']
}): PlannerRunOutput {
  return {
    schemaVersion: alayaSchemaVersion,
    runId: params.input.runId,
    trigger: params.input.trigger,
    processedTurns: params.processedTurns ?? 0,
    producedCandidates: params.producedCandidates ?? 0,
    droppedCandidates: params.droppedCandidates ?? 0,
    candidates: params.candidates ?? [],
    records: params.records ?? [],
    writeResult: params.writeResult,
    nextCheckpoint: params.nextCheckpoint,
    metrics: {
      elapsedMs: Date.now() - params.startedAt,
      embeddingCount: params.metrics?.embeddingCount ?? 0,
      llmPromptTokens: params.metrics?.llmPromptTokens,
      llmCompletionTokens: params.metrics?.llmCompletionTokens,
    },
    errors: params.errors,
  }
}

async function resolveCheckpoint(
  input: PlannerRunInput,
  store: ShortTermMemoryStore,
  errors: PlannerRunOutput['errors'],
): Promise<PlannerCheckpoint | undefined> {
  if (input.checkpoint) {
    return input.checkpoint
  }

  try {
    return await store.getCheckpoint(input.scope.workspaceId)
  }
  catch (error) {
    errors.push({
      code: 'ALAYA_E_STORE_READ_FAILED',
      message: error instanceof Error ? error.message : 'Failed to read planner checkpoint',
      retriable: true,
    })
    return undefined
  }
}

async function loadTurns(
  input: PlannerRunInput,
  checkpoint: PlannerCheckpoint | undefined,
  workspaceSource: WorkspaceMemorySource,
  errors: PlannerRunOutput['errors'],
) {
  try {
    return await workspaceSource.listTurns({
      scope: input.scope,
      window: input.window,
      checkpoint,
      maxConversations: input.budget.maxConversations,
      maxTurns: input.budget.maxTurns,
    })
  }
  catch (error) {
    errors.push({
      code: 'ALAYA_E_STORE_READ_FAILED',
      message: error instanceof Error ? error.message : 'Failed to list workspace turns',
      retriable: true,
    })
    return { turns: [] as WorkspaceTurn[] }
  }
}

async function extractCandidates(
  input: PlannerRunInput,
  turns: WorkspaceTurn[],
  llm: MemoryLlmProvider,
  errors: PlannerRunOutput['errors'],
) {
  const raw = await llm.extractCandidates({
    workspaceId: input.scope.workspaceId,
    sessionId: input.scope.sessionId,
    turns,
    maxPromptTokens: input.budget.maxPromptTokens,
    allowedCategories: [...alayaMemoryCategories],
    allowedRetentionReasons: [...alayaRetentionReasons],
  })
  const parsed = safeParse(plannerExtractionSchema, raw)
  if (!parsed.success) {
    errors.push({
      code: 'ALAYA_E_LLM_OUTPUT_INVALID',
      message: `Invalid planner extraction payload: ${parsed.issues[0]?.message ?? 'unknown parse error'}`,
      retriable: true,
    })
    return
  }

  return parsed.output
}

function normalizeCandidates(
  extraction: PlannerExtractionFromLlm,
  input: PlannerRunInput,
  hashText: (input: string) => string,
): PlannerCandidate[] {
  const filtered: PlannerCandidate[] = []

  for (const [index, candidate] of extraction.candidates.entries()) {
    const normalizedSourceRefs: PlannerSourceRef[] = candidate.sourceRefs
      .slice(0, input.budget.maxSourceRefsPerCandidate)
      .map(sourceRef => ({
        conversationId: sourceRef.conversationId.trim(),
        turnId: sourceRef.turnId.trim(),
        eventAt: sourceRef.eventAt,
      }))

    if (normalizedSourceRefs.length === 0)
      continue

    const normalizedTags = [...new Set(
      candidate.tags
        .map(tag => tag.trim())
        .filter(Boolean),
    )]
      .slice(0, 12)

    const normalizedSummary = candidate.summary.trim()
    if (!normalizedSummary)
      continue

    const sourceKey = normalizedSourceRefs.map(sourceRef => `${sourceRef.conversationId}:${sourceRef.turnId}`).join('|')
    const candidateId = candidate.candidateId || `cand_${hashText(`${index}|${candidate.category}|${normalizedSummary}|${sourceKey}`)}`

    filtered.push({
      candidateId,
      shouldStore: true,
      summary: normalizedSummary,
      category: candidate.category,
      tags: normalizedTags,
      importance: candidate.importance,
      durability: clamp01(candidate.durability),
      emotionIntensity: clamp01(candidate.emotionIntensity),
      retentionReason: candidate.retentionReason,
      sourceRefs: normalizedSourceRefs,
      emotion: candidate.emotion
        ? {
            valence: candidate.emotion.valence,
            labels: [...new Set(candidate.emotion.labels.map(label => label.trim()).filter(Boolean))].slice(0, 6),
            evidence: candidate.emotion.evidence,
          }
        : undefined,
    })
  }

  return filtered
}

function buildShortTermRecords(
  input: PlannerRunInput,
  candidates: PlannerCandidate[],
  hashText: (input: string) => string,
): ShortTermMemoryRecord[] {
  return candidates.map((candidate) => {
    const eventAt = Math.min(...candidate.sourceRefs.map(sourceRef => sourceRef.eventAt))
    const sourceFrom = Math.min(...candidate.sourceRefs.map(sourceRef => sourceRef.eventAt))
    const sourceTo = Math.max(...candidate.sourceRefs.map(sourceRef => sourceRef.eventAt))
    const sourceKey = candidate.sourceRefs.map(sourceRef => `${sourceRef.conversationId}:${sourceRef.turnId}`).join('|')
    const idempotencyKey = hashText(`${input.scope.workspaceId}|${candidate.category}|${candidate.summary}|${sourceKey}`)
    const contentHash = hashText(candidate.summary.toLowerCase())
    const halfLifeDays = resolveHalfLifeDays(candidate)

    return {
      memoryId: `stm_${idempotencyKey}`,
      workspaceId: input.scope.workspaceId,
      sessionId: input.scope.sessionId,
      conversationId: candidate.sourceRefs[0]?.conversationId,
      summary: candidate.summary,
      category: candidate.category,
      tags: candidate.tags,
      importance: candidate.importance,
      durability: candidate.durability,
      emotionIntensity: candidate.emotionIntensity,
      retentionReason: candidate.retentionReason,
      sourceRefs: candidate.sourceRefs,
      sourceRange: {
        fromAt: sourceFrom,
        toAt: sourceTo,
      },
      embedding: {
        status: 'pending',
      },
      retention: {
        status: 'active',
      },
      decay: {
        halfLifeDays,
        reinforcedCount: 0,
      },
      eventAt,
      createdAt: input.now,
      updatedAt: input.now,
      lastAccessedAt: input.now,
      accessCount: 0,
      idempotencyKey,
      contentHash,
      metadata: {
        plannerRunId: input.runId,
        trigger: input.trigger,
        emotion: candidate.emotion,
      },
    }
  })
}

async function attachEmbeddings(
  records: ShortTermMemoryRecord[],
  embeddingProvider: MemoryEmbeddingProvider | undefined,
  errors: PlannerRunOutput['errors'],
  metrics: PlannerRunOutput['metrics'],
) {
  if (!embeddingProvider || records.length === 0) {
    return
  }

  try {
    const embeddingResult = await embeddingProvider.embed({
      texts: records.map(record => record.summary),
    })

    if (embeddingResult.vectors.length !== records.length) {
      errors.push({
        code: 'ALAYA_E_EMBEDDING_DIM_MISMATCH',
        message: `Embedding result size mismatch: expected ${records.length}, got ${embeddingResult.vectors.length}`,
        retriable: true,
      })

      const now = Date.now()
      for (const record of records) {
        record.embedding = {
          status: 'failed',
          failureReason: 'Embedding result size mismatch',
          generatedAt: now,
        }
      }

      return
    }

    const now = Date.now()
    for (const [index, record] of records.entries()) {
      record.embedding = {
        status: 'ready',
        model: embeddingResult.model,
        dimension: embeddingResult.dimension,
        vector: embeddingResult.vectors[index],
        generatedAt: now,
      }
    }

    metrics.embeddingCount = records.length
  }
  catch (error) {
    errors.push({
      code: 'ALAYA_E_STORE_WRITE_FAILED',
      message: error instanceof Error ? error.message : 'Failed to generate embeddings',
      retriable: true,
    })

    const now = Date.now()
    for (const record of records) {
      record.embedding = {
        status: 'failed',
        failureReason: error instanceof Error ? error.message : 'Embedding provider failed',
        generatedAt: now,
      }
    }
  }
}

function createNextCheckpoint(
  input: PlannerRunInput,
  turnsResult: { nextCursor?: string, cursorType?: PlannerCheckpoint['cursorType'] },
  turns: WorkspaceTurn[],
): PlannerCheckpoint | undefined {
  if (turns.length === 0) {
    return input.checkpoint
  }

  const lastTurn = turns[turns.length - 1]
  return {
    workspaceId: input.scope.workspaceId,
    cursorType: turnsResult.cursorType ?? 'turn_id',
    cursor: turnsResult.nextCursor ?? lastTurn.turnId,
    updatedAt: input.now,
  }
}
