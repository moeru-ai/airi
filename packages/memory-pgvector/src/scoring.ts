import type {
  MemoryRecord,
  MemorySearchFilters,
  MemorySearchRequestEvent,
  MemorySearchResult,
} from '@proj-airi/server-sdk'

import type { MemoryModuleConfig } from './types.js'

import { cosineSimilarity, lexicalSimilarity, tokenize } from './text.js'
import { clamp01 } from './types.js'

function matchesScope(item: MemoryRecord, scope?: MemorySearchFilters['scope']): boolean {
  if (!scope) {
    return true
  }

  return Object.entries(scope).every(([key, value]) => {
    if (value == null || value === '') {
      return true
    }

    return item.scope[key as keyof typeof item.scope] === value
  })
}

export function matchesFilters(item: MemoryRecord, filters?: MemorySearchFilters): boolean {
  if (!filters) {
    return true
  }

  if (!matchesScope(item, filters.scope)) {
    return false
  }

  if (filters.archived !== undefined && Boolean(item.archived) !== filters.archived) {
    return false
  }

  if (filters.kinds?.length && !filters.kinds.includes(item.kind)) {
    return false
  }

  if (filters.sourceKinds?.length && !filters.sourceKinds.includes(item.source.kind)) {
    return false
  }

  if (filters.tags?.length && !filters.tags.every(tag => item.tags.includes(tag.toLowerCase()))) {
    return false
  }

  if (filters.minImportance !== undefined && item.importance < filters.minImportance) {
    return false
  }

  return true
}

function recencyScore(item: MemoryRecord): number {
  const ageMs = Math.max(0, Date.now() - item.updatedAt)
  const ageDays = ageMs / 86_400_000

  return clamp01(1 / (1 + ageDays / 30))
}

function tagScore(queryText: string, item: MemoryRecord): number {
  const queryTokens = new Set(tokenize(queryText))
  if (queryTokens.size === 0 || item.tags.length === 0) {
    return 0
  }

  let overlap = 0
  for (const tag of item.tags) {
    if (queryTokens.has(tag)) {
      overlap += 1
    }
  }

  return overlap / item.tags.length
}

function scopeScore(item: MemoryRecord, filters?: MemorySearchFilters): number {
  const scope = filters?.scope
  if (!scope) {
    return 0
  }

  const entries = Object.entries(scope).filter(([, value]) => Boolean(value))
  if (entries.length === 0) {
    return 0
  }

  let matches = 0
  for (const [key, value] of entries) {
    if (item.scope[key as keyof typeof item.scope] === value) {
      matches += 1
    }
  }

  return matches / entries.length
}

export function scoreMemory(
  item: MemoryRecord,
  request: MemorySearchRequestEvent,
  config: MemoryModuleConfig,
  queryEmbedding?: number[],
): MemorySearchResult {
  const semantic = request.query ? cosineSimilarity(queryEmbedding, item.embedding) : 0
  const lexical = request.query ? lexicalSimilarity(request.query, `${item.summary || ''} ${item.content}`) : 0
  const tag = request.query ? tagScore(request.query, item) : 0
  const importance = clamp01(item.importance / 10)
  const recency = recencyScore(item)
  const scope = scopeScore(item, request.filters)

  const reasons: MemorySearchResult['reasons'] = [
    { kind: 'semantic', value: semantic },
    { kind: 'lexical', value: lexical },
    { kind: 'tag', value: tag },
    { kind: 'importance', value: importance },
    { kind: 'recency', value: recency },
    { kind: 'scope', value: scope },
  ]

  let score = 0
  if (request.strategy !== 'lexical') {
    score += semantic * config.retrieval.semanticWeight
  }
  if (request.strategy !== 'semantic') {
    score += lexical * config.retrieval.lexicalWeight
  }
  score += tag * config.retrieval.tagWeight
  score += importance * config.retrieval.importanceWeight
  score += recency * config.retrieval.recencyWeight
  score += scope * 0.05
  score *= 0.5 + item.confidence / 2

  return {
    item,
    score,
    reasons,
  }
}
