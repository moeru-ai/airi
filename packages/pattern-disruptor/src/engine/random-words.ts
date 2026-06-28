import type {
  PatternDisruptorPartOfSpeechCode,
  PatternDisruptorSettings,
  ResolvedPatternDisruptorLanguage,
  SynonymMap,
  WordBankEntry,
} from '../types'

import { getSynonymMap } from '../data/synonyms'
import { getWordBank } from '../data/words'
import {
  isStopword,
  normalizeToken,
  PART_OF_SPEECH_CODE_BY_NAME,
  resolvePatternDisruptorLanguage,
  tokenizeWords,
} from '../data/language'

interface GenerateRandomWordsInput {
  settings: PatternDisruptorSettings
  userMessage: string
  wordHistory?: Iterable<string>
  random?: () => number
}

interface RandomWordGenerationContext {
  userMessage: string
  filteredBank: WordBankEntry[]
  count: number
  synonyms: SynonymMap
  language: ResolvedPatternDisruptorLanguage
  history: Set<string>
  settings: PatternDisruptorSettings
  random: () => number
}

function pick<T>(items: T[], random: () => number): T | undefined {
  if (items.length === 0) return undefined
  return items[Math.floor(random() * items.length)]
}

function sampleWithoutReplacement<T>(items: T[], count: number, random: () => number): T[] {
  const pool = [...items]
  const selected: T[] = []
  while (pool.length > 0 && selected.length < count) {
    const index = Math.floor(random() * pool.length)
    const [item] = pool.splice(index, 1)
    selected.push(item)
  }
  return selected
}

function selectedPartOfSpeechCodes(settings: PatternDisruptorSettings): Set<PatternDisruptorPartOfSpeechCode> {
  const codes = new Set<PatternDisruptorPartOfSpeechCode>()
  for (const [name, enabled] of Object.entries(settings.randomWords.partsOfSpeech)) {
    if (enabled) codes.add(PART_OF_SPEECH_CODE_BY_NAME[name as keyof typeof PART_OF_SPEECH_CODE_BY_NAME])
  }
  return codes
}

function normalizeWordSet(words: Iterable<string> | undefined): Set<string> {
  return new Set(Array.from(words ?? []).map((word) => word.toLowerCase()))
}

function isAllowedWordBankEntry(input: {
  word: string
  partOfSpeech: PatternDisruptorPartOfSpeechCode
  partsOfSpeech: Set<PatternDisruptorPartOfSpeechCode>
  blacklist: Set<string>
  history: Set<string>
  exactLength: number
}): boolean {
  const lower = input.word.toLowerCase()
  return (
    !input.blacklist.has(lower) &&
    !input.history.has(lower) &&
    (input.partsOfSpeech.size === 0 || input.partsOfSpeech.has(input.partOfSpeech)) &&
    (input.exactLength <= 0 || input.word.length === input.exactLength)
  )
}

function filterWordBank(input: {
  bank: WordBankEntry[]
  settings: PatternDisruptorSettings
  history: Set<string>
}): WordBankEntry[] {
  const partsOfSpeech = selectedPartOfSpeechCodes(input.settings)
  const blacklist = normalizeWordSet(input.settings.randomWords.blacklist)
  const exactLength = input.settings.randomWords.wordLength

  return input.bank.filter(([word, partOfSpeech]) => {
    return isAllowedWordBankEntry({
      word,
      partOfSpeech,
      partsOfSpeech,
      blacklist,
      history: input.history,
      exactLength,
    })
  })
}

function canUseUniqueWord(input: {
  word: string
  seen: Set<string>
  history: Set<string>
  blacklist: Set<string>
}): boolean {
  const lower = input.word.toLowerCase()
  return Boolean(input.word) && !input.seen.has(lower) && !input.history.has(lower) && !input.blacklist.has(lower)
}

function uniqueWords(words: string[], count: number, history: Set<string>, settings: PatternDisruptorSettings) {
  const blacklist = normalizeWordSet(settings.randomWords.blacklist)
  const seen = new Set<string>()
  const result: string[] = []

  for (const word of words) {
    if (!canUseUniqueWord({ word, seen, history, blacklist })) continue
    const lower = word.toLowerCase()
    seen.add(lower)
    result.push(word)
    if (result.length >= count) break
  }

  return result
}

function randomMode(input: { filteredBank: WordBankEntry[]; count: number; random: () => number }): string[] {
  return sampleWithoutReplacement(input.filteredBank, input.count, input.random).map(([word]) => word)
}

function collectAssociations(
  anchor: string,
  synonyms: SynonymMap,
  language: ResolvedPatternDisruptorLanguage,
): string[] {
  const normalized = normalizeToken(anchor, language)
  const entry = synonyms[normalized] ?? synonyms[anchor.toLowerCase()]
  if (!entry) return []
  return [...entry.a, ...entry.s]
}

function doublePassMode(input: {
  filteredBank: WordBankEntry[]
  count: number
  synonyms: SynonymMap
  language: ResolvedPatternDisruptorLanguage
  history: Set<string>
  settings: PatternDisruptorSettings
  random: () => number
}): string[] {
  const anchorCandidates = input.filteredBank.filter(
    ([word]) => collectAssociations(word, input.synonyms, input.language).length > 0,
  )
  const anchor = pick(anchorCandidates, input.random)?.[0]
  if (!anchor) return randomMode(input)

  const associations = sampleWithoutReplacement(
    collectAssociations(anchor, input.synonyms, input.language),
    input.count - 1,
    input.random,
  )
  const fallback = randomMode(input)
  return uniqueWords([anchor, ...associations, ...fallback], input.count, input.history, input.settings)
}

function contextualMode(input: RandomWordGenerationContext): string[] {
  const keywords = tokenizeWords(input.userMessage)
    .map((token) => normalizeToken(token, input.language))
    .filter((token) => !isStopword(token, input.language) && Boolean(input.synonyms[token]))

  const anchor = pick(Array.from(new Set(keywords)), input.random)
  if (!anchor) return doublePassMode(input)

  const associations = sampleWithoutReplacement(
    collectAssociations(anchor, input.synonyms, input.language),
    input.count,
    input.random,
  )
  const fallback = randomMode(input)
  return uniqueWords([...associations, ...fallback], input.count, input.history, input.settings)
}

function createGenerationContext(input: GenerateRandomWordsInput): RandomWordGenerationContext {
  const language = resolvePatternDisruptorLanguage(input.settings.language, input.userMessage)
  const history = normalizeWordSet(input.wordHistory)
  const filteredBank = filterWordBank({
    bank: getWordBank(language),
    settings: input.settings,
    history,
  })

  return {
    userMessage: input.userMessage,
    filteredBank,
    count: input.settings.randomWords.wordCount,
    synonyms: getSynonymMap(language),
    language,
    history,
    settings: input.settings,
    random: input.random ?? Math.random,
  }
}

const WORD_GENERATORS = {
  contextual: contextualMode,
  'double-pass': doublePassMode,
  random: (context: RandomWordGenerationContext) =>
    uniqueWords(randomMode(context), context.count, context.history, context.settings),
}

export function generateRandomWords(input: GenerateRandomWordsInput): string[] {
  if (!input.settings.enabled || !input.settings.randomWords.enabled) return []
  const context = createGenerationContext(input)
  return WORD_GENERATORS[input.settings.randomWords.mode](context)
}
