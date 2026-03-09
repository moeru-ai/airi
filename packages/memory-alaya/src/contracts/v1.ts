import type { InferOutput } from 'valibot'

import {
  array,
  literal,
  maxLength,
  maxValue,
  minLength,
  minValue,
  number,
  object,
  optional,
  picklist,
  pipe,
  string,
} from 'valibot'

export const alayaSchemaVersion = 'v2' as const
export type AlayaSchemaVersion = typeof alayaSchemaVersion

export const alayaPlannerTriggers = [
  'scheduled',
  'manual',
] as const
export type AlayaPlannerTrigger = (typeof alayaPlannerTriggers)[number]

export const alayaMemoryCategories = [
  'preference',
  'fact',
  'relationship',
  'task',
  'constraint',
  'event',
] as const
export type AlayaMemoryCategory = (typeof alayaMemoryCategories)[number]

export const alayaDefaultMemoryTags = [
  'user_profile',
  'user_like',
  'user_dislike',
  'habit',
  'explicit_request',
  'assistant_commitment',
  'deadline',
  'plan',
  'correction',
  'conflict',
  'boundary',
  'emotion_peak',
  'emotion_positive',
  'emotion_negative',
  'emotion_mixed',
  'emotion_affection',
  'emotion_trust',
  'emotion_gratitude',
  'emotion_sadness',
  'emotion_anxiety',
  'emotion_anger',
  'key_episode',
  'ephemeral',
] as const
export type AlayaDefaultMemoryTag = (typeof alayaDefaultMemoryTags)[number]
export type AlayaMemoryTag = AlayaDefaultMemoryTag | (string & {})

export const alayaRetentionReasons = [
  'identity',
  'stable_preference',
  'boundary',
  'relationship_anchor',
  'ongoing_task',
  'recurring_pattern',
  'emotional_peak',
  'assistant_commitment',
  'key_event',
] as const
export type AlayaRetentionReason = (typeof alayaRetentionReasons)[number]

export const alayaEmotionValences = [
  'positive',
  'negative',
  'mixed',
  'neutral',
] as const
export type AlayaEmotionValence = (typeof alayaEmotionValences)[number]

export const alayaEmotionEvidences = [
  'explicit',
  'inferred',
] as const
export type AlayaEmotionEvidence = (typeof alayaEmotionEvidences)[number]

export interface AlayaEmotionMetadata {
  valence: AlayaEmotionValence
  labels: string[]
  evidence: AlayaEmotionEvidence
}

export const alayaMemoryStatuses = [
  'active',
  'merged',
  'archived',
  'deleted',
] as const
export type AlayaMemoryStatus = (typeof alayaMemoryStatuses)[number]

export const alayaEmbeddingStatuses = [
  'ready',
  'pending',
  'failed',
] as const
export type AlayaEmbeddingStatus = (typeof alayaEmbeddingStatuses)[number]

export const plannerErrorCodes = [
  'ALAYA_E_SCHEMA_VERSION_UNSUPPORTED',
  'ALAYA_E_INVALID_INPUT',
  'ALAYA_E_INVALID_CHECKPOINT',
  'ALAYA_E_LLM_OUTPUT_INVALID',
  'ALAYA_E_EMBEDDING_DIM_MISMATCH',
  'ALAYA_E_IDEMPOTENCY_CONFLICT',
  'ALAYA_E_STORE_WRITE_FAILED',
  'ALAYA_E_STORE_READ_FAILED',
] as const
export type AlayaPlannerErrorCode = (typeof plannerErrorCodes)[number]

export const queryErrorCodes = [
  'ALAYA_E_SCHEMA_VERSION_UNSUPPORTED',
  'ALAYA_E_INVALID_INPUT',
  'ALAYA_E_STORE_READ_FAILED',
  'ALAYA_E_STORE_WRITE_FAILED',
  'ALAYA_E_QUERY_EMBEDDING_FAILED',
  'ALAYA_E_QUERY_TOKEN_ESTIMATE_FAILED',
] as const
export type AlayaQueryErrorCode = (typeof queryErrorCodes)[number]

export const chatMessageRoles = [
  'system',
  'user',
  'assistant',
  'tool',
] as const
export type ChatMessageRole = (typeof chatMessageRoles)[number]

export interface WorkspaceTurn {
  workspaceId: string
  sessionId: string
  conversationId: string
  turnId: string
  role: ChatMessageRole
  content: string
  createdAt: number
  tokenCount?: number
  source: {
    channel: string
    messageId?: string
    userId?: string
  }
  metadata?: Record<string, unknown>
}

export interface PlannerSourceRef {
  conversationId: string
  turnId: string
  eventAt: number
}

export interface PlannerCheckpoint {
  workspaceId: string
  cursorType: 'turn_id' | 'timestamp'
  cursor: string
  updatedAt: number
}

export interface PlannerRunInput {
  schemaVersion: AlayaSchemaVersion
  runId: string
  trigger: AlayaPlannerTrigger
  now: number
  scope: {
    workspaceId: string
    sessionId?: string
    conversationIds?: string[]
  }
  window?: {
    fromTs?: number
    toTs?: number
  }
  checkpoint?: PlannerCheckpoint
  budget: {
    maxConversations: number
    maxTurns: number
    maxPromptTokens: number
    maxSourceRefsPerCandidate: number
  }
  dryRun?: boolean
}

export interface PlannerCandidate {
  candidateId: string
  shouldStore: true
  summary: string
  category: AlayaMemoryCategory
  tags: AlayaMemoryTag[]
  importance: number
  durability: number
  emotionIntensity: number
  retentionReason: AlayaRetentionReason
  sourceRefs: PlannerSourceRef[]
  emotion?: AlayaEmotionMetadata
}

export interface ShortTermMemoryMetadata {
  plannerRunId?: string
  trigger?: AlayaPlannerTrigger
  emotion?: AlayaEmotionMetadata
  [key: string]: unknown
}

export interface ShortTermMemoryRecord {
  memoryId: string
  workspaceId: string
  sessionId?: string
  conversationId?: string
  summary: string
  category: AlayaMemoryCategory
  tags: AlayaMemoryTag[]
  importance: number
  durability: number
  emotionIntensity: number
  retentionReason: AlayaRetentionReason
  sourceRefs: PlannerSourceRef[]
  sourceRange?: {
    fromAt: number
    toAt: number
  }
  embedding: {
    status: AlayaEmbeddingStatus
    model?: string
    dimension?: number
    vector?: number[]
    generatedAt?: number
    failureReason?: string
  }
  retention: {
    status: AlayaMemoryStatus
    ttlDays?: number
    expiresAt?: number
    archivedAt?: number
    deletedAt?: number
  }
  decay: {
    halfLifeDays: number
    reinforcedCount: number
    lastReinforcedAt?: number
  }
  eventAt: number
  createdAt: number
  updatedAt: number
  lastAccessedAt: number
  accessCount: number
  idempotencyKey: string
  contentHash: string
  metadata: ShortTermMemoryMetadata
}

export interface PlannerRunOutput {
  schemaVersion: AlayaSchemaVersion
  runId: string
  trigger: AlayaPlannerTrigger
  processedTurns: number
  producedCandidates: number
  droppedCandidates: number
  candidates: PlannerCandidate[]
  records: ShortTermMemoryRecord[]
  writeResult?: {
    inserted: number
    merged: number
    skipped: number
  }
  nextCheckpoint?: PlannerCheckpoint
  metrics: {
    elapsedMs: number
    embeddingCount: number
    llmPromptTokens?: number
    llmCompletionTokens?: number
  }
  errors: Array<{
    code: AlayaPlannerErrorCode
    message: string
    retriable: boolean
  }>
}

export const alayaQueryRecallModes = [
  'full',
] as const
export type AlayaQueryRecallMode = (typeof alayaQueryRecallModes)[number]

export const defaultQueryBudget = {
  maxSelected: 8,
  maxContextTokens: 900,
  maxSummaryCharsPerRecord: 280,
} as const

export const defaultQueryOptions = {
  includeSummary: true,
} as const

export interface QueryEngineInput {
  schemaVersion: AlayaSchemaVersion
  now: number
  scope: {
    workspaceId: string
    sessionId?: string
  }
  query: {
    text: string
  }
  recall: {
    mode: AlayaQueryRecallMode
  }
  budget: {
    maxSelected: number
    maxContextTokens: number
    maxSummaryCharsPerRecord: number
  }
  options?: {
    includeSummary?: boolean
  }
}

export type QueryMatchMode = 'vector' | 'keyword' | 'none'

export interface QueryScoredRecord {
  memoryId: string
  workspaceId: string
  sessionId?: string
  summary: string
  category: AlayaMemoryCategory
  tags: AlayaMemoryTag[]
  importance: number
  durability: number
  emotionIntensity: number
  retentionReason: AlayaRetentionReason
  eventAt: number
  updatedAt: number
  lastAccessedAt: number
  accessCount: number
  emotion?: AlayaEmotionMetadata
  matchMode: QueryMatchMode
  similarity: number
  timeWeight: number
  emotionWeight: number
  score: number
  estimatedTokens: number
}

export interface QueryEngineOutput {
  schemaVersion: AlayaSchemaVersion
  scope: QueryEngineInput['scope']
  query: QueryEngineInput['query']
  recalled: QueryScoredRecord[]
  selected: QueryScoredRecord[]
  context: {
    text: string
    estimatedTokens: number
  }
  metrics: {
    elapsedMs: number
    scannedRecords: number
    selectedRecords: number
    vectorScoredRecords: number
    keywordScoredRecords: number
    thresholdRejectedRecords: number
    accessUpdatedRecords: number
    queryEmbeddingGenerated: boolean
    queryEmbeddingModel?: string
    queryEmbeddingDimension?: number
  }
  errors: Array<{
    code: AlayaQueryErrorCode
    message: string
    retriable: boolean
  }>
}

export const plannerSourceRefSchema = object({
  conversationId: pipe(string(), minLength(1)),
  turnId: pipe(string(), minLength(1)),
  eventAt: pipe(number(), minValue(0)),
})

export const emotionMetadataSchema = object({
  valence: picklist(alayaEmotionValences),
  labels: pipe(array(pipe(string(), minLength(1))), maxLength(6)),
  evidence: picklist(alayaEmotionEvidences),
})

export const plannerCandidateSchema = object({
  shouldStore: literal(true),
  summary: pipe(string(), minLength(1)),
  category: picklist(alayaMemoryCategories),
  tags: pipe(array(pipe(string(), minLength(1))), maxLength(12)),
  importance: pipe(number(), minValue(1), maxValue(10)),
  durability: pipe(number(), minValue(0), maxValue(1)),
  emotionIntensity: pipe(number(), minValue(0), maxValue(1)),
  retentionReason: picklist(alayaRetentionReasons),
  sourceRefs: pipe(array(plannerSourceRefSchema), minLength(1)),
  emotion: optional(emotionMetadataSchema),
  candidateId: optional(pipe(string(), minLength(1))),
})

export const plannerExtractionSchema = object({
  candidates: pipe(array(plannerCandidateSchema), maxLength(512)),
  usage: optional(object({
    promptTokens: pipe(number(), minValue(0)),
    completionTokens: pipe(number(), minValue(0)),
  })),
})

export type PlannerCandidateFromLlm = InferOutput<typeof plannerCandidateSchema>
export type PlannerExtractionFromLlm = InferOutput<typeof plannerExtractionSchema>

export const defaultPlannerTriggerPolicy = {
  effectiveTurnsThreshold: 24,
  hardTurnsThreshold: 40,
  minTurnsForIdleRun: 8,
  idleRunAfterMs: 20 * 60 * 1000,
} as const
