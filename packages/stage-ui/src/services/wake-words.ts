import type { AiriCard, WakeWordKeyword, WakeWordMatch } from '../types/airiCard'

import modelTokens from './kws-vocabulary.json'

/** Token names from the pinned bilingual Zipformer 3M model's /tokens.txt. */
export const pinnedKwsVocabulary: ReadonlySet<string> = new Set(modelTokens)

export interface WakeWordTarget {
  cardId: string
  keyword: string
}

export interface WakeWordConflict {
  sequence: string
  cardIds: string[]
  ownerCardId?: string
}

/** A device chooses one owner for a pronunciation shared by several cards. */
export type WakeWordOwnership = Record<string, string>

const minimumFloat32 = 2 ** -126
const maximumFloat32 = 3.4028234663852886e38

/**
 * Creates a stable key for one model token sequence.
 *
 * @example
 * wakeWordSequence(['HELLO', 'WORLD'])
 * // => 'HELLO WORLD'
 */
export function wakeWordSequence(tokens: readonly string[]): string {
  return tokens.join(' ')
}

function validateNumber(value: number | undefined, name: 'score' | 'threshold') {
  if (value === undefined)
    return

  if (!Number.isFinite(value) || value < minimumFloat32 || value > (name === 'score' ? maximumFloat32 : 1))
    throw new RangeError(`${name} is outside the KWS model range`)
}

/**
 * Validates model tokens before a card update reaches storage or the KWS worker.
 * The selected model's tokens.txt supplies the vocabulary.
 */
export function validateWakeWordKeywords(keywords: readonly WakeWordKeyword[], vocabulary: ReadonlySet<string>): void {
  if (!Array.isArray(keywords))
    throw new TypeError('keywords must be an array')

  const sequences = new Set<string>()
  for (const keyword of keywords) {
    if (typeof keyword?.label !== 'string' || !keyword.label.trim())
      throw new TypeError('Each wake word needs a name')
    if (!Array.isArray(keyword.matches) || keyword.matches.length === 0)
      throw new TypeError('Each wake word needs at least one pronunciation')

    validateNumber(keyword.score, 'score')
    validateNumber(keyword.threshold, 'threshold')

    for (const match of keyword.matches) {
      if (!Array.isArray(match?.tokens) || match.tokens.length === 0)
        throw new TypeError('Each pronunciation needs at least one token')

      for (const token of match.tokens) {
        if (typeof token !== 'string' || !token || /[\s\0]/u.test(token) || !vocabulary.has(token))
          throw new Error(`Invalid or unknown wake word token: ${String(token)}`)
      }

      const sequence = wakeWordSequence(match.tokens)
      if (sequences.has(sequence))
        throw new Error('Duplicate wake word token sequence')
      sequences.add(sequence)
      validateNumber(match.score, 'score')
      validateNumber(match.threshold, 'threshold')
    }
  }
}

/** Keeps valid imported pronunciations active while the card reports invalid ones for review. */
export function supportedWakeWordKeywords(keywords: readonly WakeWordKeyword[], vocabulary: ReadonlySet<string>): WakeWordKeyword[] {
  return keywords.flatMap((keyword) => {
    const matches = keyword.matches.filter((match) => {
      try {
        validateWakeWordKeywords([{ ...keyword, matches: [match] }], vocabulary)
        return true
      }
      catch {
        return false
      }
    })
    if (matches.length === 0)
      return []

    const active: WakeWordKeyword = { label: keyword.label, matches: [] }
    if (keyword.score !== undefined)
      active.score = keyword.score
    if (keyword.threshold !== undefined)
      active.threshold = keyword.threshold
    active.matches = matches.map((match) => {
      const copy: WakeWordMatch = { tokens: [...match.tokens] }
      if (match.score !== undefined)
        copy.score = match.score
      if (match.threshold !== undefined)
        copy.threshold = match.threshold
      return copy
    })
    return [active]
  })
}

/**
 * Builds the active KWS vocabulary and reports shared pronunciations.
 * A conflicting pronunciation stays on each card, but only its local owner can activate it.
 */
export function resolveWakeWordKeywords(cards: ReadonlyMap<string, AiriCard>, ownership: WakeWordOwnership): {
  keywords: WakeWordKeyword[]
  targets: Map<string, WakeWordTarget>
  conflicts: WakeWordConflict[]
} {
  const claims = new Map<string, Array<{ cardId: string, keyword: WakeWordKeyword, matchIndex: number }>>()
  for (const [cardId, card] of cards) {
    const keywords = card.extensions.airi.modules.wakeWords?.keywords
    if (!keywords)
      continue
    if (!Array.isArray(keywords))
      continue
    for (const keyword of keywords) {
      if (!Array.isArray(keyword?.matches))
        continue
      keyword.matches.forEach((match, matchIndex) => {
        if (!Array.isArray(match?.tokens))
          return
        const sequence = wakeWordSequence(match.tokens)
        const claim = { cardId, keyword, matchIndex }
        const existing = claims.get(sequence)
        if (existing)
          existing.push(claim)
        else
          claims.set(sequence, [claim])
      })
    }
  }

  const conflicts: WakeWordConflict[] = []
  const enabled = new Map<string, WakeWordKeyword>()
  const targets = new Map<string, WakeWordTarget>()

  for (const [sequence, holders] of claims) {
    const cardIds = [...new Set(holders.map(holder => holder.cardId))]
    const ownerCardId = cardIds.length === 1
      ? cardIds[0]
      : Object.hasOwn(ownership, sequence) ? ownership[sequence] : undefined
    if (cardIds.length > 1)
      conflicts.push({ sequence, cardIds, ...(ownerCardId && cardIds.includes(ownerCardId) ? { ownerCardId } : {}) })
    if (!ownerCardId || !cardIds.includes(ownerCardId))
      continue

    const holder = holders.find(claim => claim.cardId === ownerCardId)
    if (!holder)
      continue

    const cardKeywords = cards.get(ownerCardId)?.extensions.airi.modules.wakeWords?.keywords
    const keywordIndex = cardKeywords?.indexOf(holder.keyword)
    if (keywordIndex === undefined || keywordIndex < 0)
      continue
    const label = `${ownerCardId}:${keywordIndex}`
    const active = enabled.get(label) ?? { ...holder.keyword, matches: [] }
    active.matches.push(holder.keyword.matches[holder.matchIndex])
    enabled.set(label, active)
    targets.set(label, { cardId: ownerCardId, keyword: holder.keyword.label })
  }

  return { keywords: [...enabled].map(([label, keyword]) => ({ ...keyword, label })), targets, conflicts }
}
