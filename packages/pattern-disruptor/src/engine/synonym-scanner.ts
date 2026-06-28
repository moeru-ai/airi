import type {
  PatternDisruptorSettings,
  PatternDisruptorSynonymSuggestion,
  ResolvedPatternDisruptorLanguage,
  SynonymMap,
} from '../types'

import { getSynonymMap } from '../data/synonyms'
import { isStopword, normalizeToken, resolvePatternDisruptorLanguage, tokenizeWords } from '../data/language'

interface ScanSynonymOveruseInput {
  settings: PatternDisruptorSettings
  userMessage: string
  assistantMessages?: string[]
}

interface TokenStats {
  originalWord: string
  normalizedWord: string
  count: number
}

function shouldTrackToken(token: string, language: ResolvedPatternDisruptorLanguage): boolean {
  return token.length >= 3 && !isStopword(token, language)
}

function incrementTokenStats(stats: Map<string, TokenStats>, token: string, normalizedWord: string) {
  const existing = stats.get(normalizedWord)
  stats.set(normalizedWord, {
    originalWord: existing?.originalWord ?? token,
    normalizedWord,
    count: (existing?.count ?? 0) + 1,
  })
}

function collectTokenStats(messages: string[], language: ResolvedPatternDisruptorLanguage): TokenStats[] {
  const stats = new Map<string, TokenStats>()

  for (const message of messages) {
    for (const token of tokenizeWords(message)) {
      const normalizedWord = normalizeToken(token, language)
      if (shouldTrackToken(normalizedWord, language)) incrementTokenStats(stats, token, normalizedWord)
    }
  }

  return Array.from(stats.values())
}

function suggestionsFor(stats: TokenStats, synonyms: SynonymMap): string[] {
  return synonyms[stats.normalizedWord]?.s.slice(0, 5) ?? []
}

export function scanSynonymOveruse(input: ScanSynonymOveruseInput): PatternDisruptorSynonymSuggestion[] {
  if (!input.settings.enabled || !input.settings.synonyms.enabled) return []

  const language = resolvePatternDisruptorLanguage(input.settings.language, input.userMessage)
  const synonyms = getSynonymMap(language)
  const messages = (input.assistantMessages ?? []).slice(-input.settings.synonyms.scanDepth)

  return collectTokenStats(messages, language)
    .filter((stats) => stats.count >= input.settings.synonyms.minOccurrences)
    .map((stats) => ({
      ...stats,
      synonyms: suggestionsFor(stats, synonyms),
    }))
    .filter((row) => row.synonyms.length > 0)
    .sort((a, b) => b.count - a.count || a.originalWord.localeCompare(b.originalWord))
    .slice(0, input.settings.synonyms.topN)
}
