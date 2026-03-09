import type {
  QueryEngineOutput,
  QueryMatchMode,
  ShortTermMemoryRecord,
} from '../contracts/v1'
import type { MemoryEmbeddingProvider } from '../ports/embedding-provider'

const dayMs = 24 * 60 * 60 * 1000

export interface ScoredRecallCandidate {
  record: ShortTermMemoryRecord
  matchMode: QueryMatchMode
  similarity: number
  timeWeight: number
  emotionWeight: number
  score: number
}

export interface ScoreShortTermCandidatesOutput {
  candidates: ScoredRecallCandidate[]
  vectorScoredRecords: number
  keywordScoredRecords: number
  queryEmbeddingGenerated: boolean
  queryEmbeddingModel?: string
  queryEmbeddingDimension?: number
}

export interface ScoreShortTermCandidatesInput {
  queryText: string
  now: number
  records: ShortTermMemoryRecord[]
}

export interface ScoreShortTermCandidatesDeps {
  embedding?: MemoryEmbeddingProvider
}

function clamp01(input: number) {
  if (!Number.isFinite(input))
    return 0
  return Math.max(0, Math.min(1, input))
}

function normalizeCosineToSimilarity(cosine: number) {
  return clamp01((cosine + 1) / 2)
}

function cosineSimilarity(left: number[], right: number[]) {
  if (left.length === 0 || right.length === 0 || left.length !== right.length)
    return 0

  let dot = 0
  let leftNorm = 0
  let rightNorm = 0
  for (let index = 0; index < left.length; index += 1) {
    const leftValue = left[index]
    const rightValue = right[index]
    dot += leftValue * rightValue
    leftNorm += leftValue * leftValue
    rightNorm += rightValue * rightValue
  }

  if (leftNorm <= 0 || rightNorm <= 0)
    return 0

  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm))
}

function tokenize(input: string) {
  const normalized = input.toLowerCase()
  const tokens = new Set<string>()

  const wordMatches = normalized.match(/[a-z0-9_]+/g) ?? []
  for (const token of wordMatches) {
    if (token.length <= 1)
      continue
    tokens.add(token)
  }

  for (const char of normalized) {
    const code = char.charCodeAt(0)
    if (code >= 0x4E00 && code <= 0x9FFF)
      tokens.add(char)
  }

  return tokens
}

function keywordSimilarity(queryTerms: Set<string>, summaryTerms: Set<string>) {
  if (queryTerms.size === 0 || summaryTerms.size === 0)
    return 0

  let overlap = 0
  for (const term of queryTerms) {
    if (summaryTerms.has(term))
      overlap += 1
  }

  if (overlap <= 0)
    return 0

  return clamp01(overlap / Math.sqrt(queryTerms.size * summaryTerms.size))
}

function normalizeImportance(record: ShortTermMemoryRecord) {
  return clamp01((record.importance - 1) / 9)
}

function resolveAnchorAt(record: ShortTermMemoryRecord) {
  return Math.max(
    record.decay.lastReinforcedAt ?? 0,
    record.lastAccessedAt ?? 0,
    record.updatedAt ?? 0,
    record.eventAt ?? 0,
  )
}

function calculateTimeWeight(record: ShortTermMemoryRecord, now: number) {
  const anchorAt = resolveAnchorAt(record)
  if (!Number.isFinite(anchorAt) || anchorAt <= 0)
    return 0

  const ageDays = Math.max(0, (now - anchorAt) / dayMs)
  const halfLifeDays = Math.max(1, record.decay.halfLifeDays || 14)
  const baseDecay = 0.5 ** (ageDays / halfLifeDays)
  const usageBoost = clamp01(Math.log1p((record.accessCount ?? 0) + (record.decay.reinforcedCount ?? 0)) * 0.08)

  return clamp01(baseDecay * 0.92 + usageBoost)
}

function calculateEmotionWeight(record: ShortTermMemoryRecord) {
  return clamp01(record.emotionIntensity)
}

function calculateCompositeScore(
  similarity: number,
  record: ShortTermMemoryRecord,
  now: number,
) {
  const importanceNorm = normalizeImportance(record)
  const timeWeight = calculateTimeWeight(record, now)
  const emotionWeight = calculateEmotionWeight(record)
  const score = clamp01(
    similarity * 0.72
    + importanceNorm * 0.15
    + timeWeight * 0.08
    + emotionWeight * 0.05,
  )

  return {
    score,
    timeWeight,
    emotionWeight,
  }
}

function normalizeUpdatedAt(record: ShortTermMemoryRecord) {
  const value = record.updatedAt || record.createdAt
  return Number.isFinite(value) ? value : 0
}

export async function scoreShortTermCandidates(
  input: ScoreShortTermCandidatesInput,
  deps: ScoreShortTermCandidatesDeps,
  errors: QueryEngineOutput['errors'],
): Promise<ScoreShortTermCandidatesOutput> {
  const queryText = input.queryText.trim()
  const queryTerms = tokenize(queryText)
  let queryVector: number[] | undefined
  let queryEmbeddingModel: string | undefined
  let queryEmbeddingDimension: number | undefined
  let queryEmbeddingGenerated = false

  if (deps.embedding && queryText) {
    try {
      const embeddingResult = await deps.embedding.embed({
        texts: [queryText],
      })
      const embeddedQuery = embeddingResult.vectors[0]
      if (embeddedQuery && embeddedQuery.length > 0) {
        queryVector = embeddedQuery
        queryEmbeddingGenerated = true
        queryEmbeddingModel = embeddingResult.model
        queryEmbeddingDimension = embeddingResult.dimension
      }
    }
    catch (error) {
      errors.push({
        code: 'ALAYA_E_QUERY_EMBEDDING_FAILED',
        message: error instanceof Error ? error.message : 'Failed to generate query embedding',
        retriable: true,
      })
    }
  }

  let vectorScoredRecords = 0
  let keywordScoredRecords = 0
  const scored = input.records.map<ScoredRecallCandidate>((record) => {
    const summaryTerms = tokenize(record.summary)

    let matchMode: QueryMatchMode = 'none'
    let similarity = 0

    const candidateVector = record.embedding.status === 'ready'
      ? record.embedding.vector
      : undefined
    if (
      queryVector
      && Array.isArray(candidateVector)
      && candidateVector.length === queryVector.length
    ) {
      matchMode = 'vector'
      vectorScoredRecords += 1
      similarity = normalizeCosineToSimilarity(cosineSimilarity(queryVector, candidateVector))
    }
    else if (queryTerms.size > 0) {
      matchMode = 'keyword'
      keywordScoredRecords += 1
      similarity = keywordSimilarity(queryTerms, summaryTerms)
    }

    const composite = calculateCompositeScore(similarity, record, input.now)
    return {
      record,
      matchMode,
      similarity,
      timeWeight: composite.timeWeight,
      emotionWeight: composite.emotionWeight,
      score: composite.score,
    }
  })

  scored.sort((left, right) => {
    if (left.score !== right.score)
      return right.score - left.score
    if (left.similarity !== right.similarity)
      return right.similarity - left.similarity
    if (left.timeWeight !== right.timeWeight)
      return right.timeWeight - left.timeWeight
    if (left.record.importance !== right.record.importance)
      return right.record.importance - left.record.importance

    const leftUpdatedAt = normalizeUpdatedAt(left.record)
    const rightUpdatedAt = normalizeUpdatedAt(right.record)
    if (leftUpdatedAt !== rightUpdatedAt)
      return rightUpdatedAt - leftUpdatedAt

    return left.record.memoryId.localeCompare(right.record.memoryId)
  })

  return {
    candidates: scored,
    vectorScoredRecords,
    keywordScoredRecords,
    queryEmbeddingGenerated,
    queryEmbeddingModel,
    queryEmbeddingDimension,
  }
}
