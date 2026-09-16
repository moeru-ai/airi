import type { PatternCard, PatternRuntime } from './types'

const DEFAULT_LIMIT = 10
const MAX_LIMIT = 25

function normalizeLimit(limit: number | undefined): number {
  const fallback = Number.isFinite(limit) ? Number(limit) : DEFAULT_LIMIT
  return Math.max(1, Math.min(MAX_LIMIT, Math.floor(fallback)))
}

function tokenize(input: string): string[] {
  return [...new Set(
    input
      .toLowerCase()
      .split(/[^a-z0-9_]+/g)
      .map(token => token.trim())
      .filter(Boolean),
  )]
}

function cloneCard(card: PatternCard): PatternCard {
  const cloned: PatternCard = {
    id: card.id,
    title: card.title,
    intent: card.intent,
    whenToUse: [...card.whenToUse],
    steps: [...card.steps],
    code: card.code,
    tags: [...card.tags],
    ...(card.pitfalls ? { pitfalls: [...card.pitfalls] } : {}),
  }

  Object.freeze(cloned.whenToUse)
  Object.freeze(cloned.steps)
  Object.freeze(cloned.tags)
  if (cloned.pitfalls)
    Object.freeze(cloned.pitfalls)
  return Object.freeze(cloned)
}

function scoreCard(card: PatternCard, tokens: string[]): number {
  if (tokens.length === 0)
    return 0

  const idTokens = tokenize(card.id)
  const titleTokens = tokenize(card.title)
  const intentTokens = tokenize(card.intent)
  const tagSet = new Set(card.tags.map(tag => tag.toLowerCase()))
  const whenToUseTokens = tokenize(card.whenToUse.join(' '))
  const stepsTokens = tokenize(card.steps.join(' '))

  let score = 0
  for (const token of tokens) {
    if (tagSet.has(token))
      score += 3
    if (idTokens.includes(token))
      score += 2
    if (titleTokens.includes(token) || intentTokens.includes(token))
      score += 1
    if (whenToUseTokens.includes(token) || stepsTokens.includes(token))
      score += 1
  }
  return score
}

export function createPatternRuntime(catalog: PatternCard[]): PatternRuntime {
  const cards = [...catalog]
  const byId = new Map(cards.map(card => [card.id, card]))
  const sortedIds = [...byId.keys()].sort((a, b) => a.localeCompare(b))

  return {
    get(id: string): PatternCard | null {
      if (typeof id !== 'string' || id.trim().length === 0)
        return null

      const card = byId.get(id.trim())
      return card ? cloneCard(card) : null
    },

    find(query: string, limit?: number): PatternCard[] {
      if (typeof query !== 'string' || query.trim().length === 0)
        return []

      const max = normalizeLimit(limit)
      const tokens = tokenize(query)
      const ranked = cards
        .map(card => ({ card, score: scoreCard(card, tokens) }))
        .filter(entry => entry.score > 0)
        .sort((a, b) => {
          if (b.score !== a.score)
            return b.score - a.score
          return a.card.id.localeCompare(b.card.id)
        })
        .slice(0, max)

      return ranked.map(entry => cloneCard(entry.card))
    },

    ids(): string[] {
      return [...sortedIds]
    },

    list(limit?: number): PatternCard[] {
      const max = normalizeLimit(limit)
      return sortedIds
        .slice(0, max)
        .map(id => byId.get(id))
        .filter((card): card is PatternCard => Boolean(card))
        .map(card => cloneCard(card))
    },
  }
}
