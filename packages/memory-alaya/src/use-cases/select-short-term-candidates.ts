import type {
  QueryEngineInput,
  QueryEngineOutput,
} from '../contracts/v1'
import type { MemoryTokenEstimator } from '../ports/token-estimator'
import type { ScoredRecallCandidate } from './score-short-term-candidates'

const minVectorSimilarity = 0.58
const minKeywordSimilarity = 0.18
const minRecallScore = 0.5
const contextEmotionThreshold = 0.4
const maxTagsPerRecord = 3
const maxEmotionLabelsPerRecord = 2

export interface SelectedRecallCandidate extends ScoredRecallCandidate {
  contextText: string
  estimatedTokens: number
}

export interface SelectShortTermCandidatesInput {
  scoredCandidates: ScoredRecallCandidate[]
  budget: QueryEngineInput['budget']
  options?: QueryEngineInput['options']
}

export interface SelectShortTermCandidatesOutput {
  selected: SelectedRecallCandidate[]
  estimatedTokens: number
  thresholdRejectedRecords: number
}

function normalizeText(input: string) {
  return input.replace(/\s+/g, ' ').trim()
}

function truncateChars(input: string, maxChars: number) {
  if (maxChars <= 0)
    return ''
  if (input.length <= maxChars)
    return input
  return `${input.slice(0, maxChars - 3)}...`
}

function toFiniteInteger(input: number, fallback: number) {
  if (!Number.isFinite(input))
    return fallback
  return Math.max(1, Math.floor(input))
}

function passesRecallThreshold(candidate: ScoredRecallCandidate) {
  if (candidate.score < minRecallScore)
    return false

  if (candidate.matchMode === 'vector')
    return candidate.similarity >= minVectorSimilarity
  if (candidate.matchMode === 'keyword')
    return candidate.similarity >= minKeywordSimilarity

  return false
}

function buildContextText(
  candidate: ScoredRecallCandidate,
  options: QueryEngineInput['options'] | undefined,
  maxSummaryCharsPerRecord: number,
) {
  const includeSummary = options?.includeSummary !== false
  const summary = truncateChars(normalizeText(candidate.record.summary), maxSummaryCharsPerRecord)
  if (includeSummary && !summary)
    return ''

  const lines: string[] = []
  if (summary)
    lines.push(summary)

  const tags = candidate.record.tags
    .map(tag => normalizeText(tag))
    .filter(Boolean)
    .slice(0, maxTagsPerRecord)
  if (tags.length > 0)
    lines.push(`Tags: ${tags.join(', ')}`)

  const emotion = candidate.record.metadata.emotion
  if (candidate.record.emotionIntensity >= contextEmotionThreshold && emotion) {
    const emotionParts = [
      emotion.valence,
      ...emotion.labels.slice(0, maxEmotionLabelsPerRecord),
    ].filter(Boolean)
    if (emotionParts.length > 0)
      lines.push(`Emotion: ${emotionParts.join(' | ')}`)
  }

  return lines.join('\n')
}

function estimateTokensSafe(
  tokenEstimator: MemoryTokenEstimator,
  text: string,
  errors: QueryEngineOutput['errors'],
) {
  try {
    const estimated = tokenEstimator.estimate({ text })
    if (!Number.isFinite(estimated))
      return Math.max(1, Math.ceil(text.length / 4))
    return Math.max(1, Math.floor(estimated))
  }
  catch (error) {
    errors.push({
      code: 'ALAYA_E_QUERY_TOKEN_ESTIMATE_FAILED',
      message: error instanceof Error ? error.message : 'Failed to estimate tokens for recalled memory',
      retriable: true,
    })
    return Math.max(1, Math.ceil(text.length / 4))
  }
}

export function selectShortTermCandidates(
  input: SelectShortTermCandidatesInput,
  tokenEstimator: MemoryTokenEstimator,
  errors: QueryEngineOutput['errors'],
): SelectShortTermCandidatesOutput {
  const maxSelected = toFiniteInteger(input.budget.maxSelected, 8)
  const maxContextTokens = toFiniteInteger(input.budget.maxContextTokens, 900)
  const maxSummaryCharsPerRecord = Math.max(
    8,
    toFiniteInteger(input.budget.maxSummaryCharsPerRecord, 280),
  )
  const selected: SelectedRecallCandidate[] = []
  let consumedTokens = 0
  let thresholdRejectedRecords = 0

  for (const candidate of input.scoredCandidates) {
    if (selected.length >= maxSelected)
      break
    if (!passesRecallThreshold(candidate)) {
      thresholdRejectedRecords += 1
      continue
    }

    const contextText = buildContextText(candidate, input.options, maxSummaryCharsPerRecord)
    if (!contextText)
      continue

    const estimatedTokens = estimateTokensSafe(tokenEstimator, contextText, errors)
    const nextTokens = consumedTokens + estimatedTokens
    const canFit = nextTokens <= maxContextTokens
    if (!canFit && selected.length > 0)
      continue

    selected.push({
      ...candidate,
      contextText,
      estimatedTokens,
    })
    consumedTokens = nextTokens
  }

  return {
    selected,
    estimatedTokens: consumedTokens,
    thresholdRejectedRecords,
  }
}
