export type PatternDisruptorLanguage = 'auto' | 'en' | 'ru'
export type ResolvedPatternDisruptorLanguage = Exclude<PatternDisruptorLanguage, 'auto'>

export type PatternDisruptorGenerationMode = 'random' | 'double-pass' | 'contextual'
export type PatternDisruptorInjectionRole = 'system' | 'user' | 'assistant'
export type PatternDisruptorPartOfSpeechName = 'noun' | 'verb' | 'adjective' | 'adverb'
export type PatternDisruptorPartOfSpeechCode = 'n' | 'v' | 'a' | 'r'

export interface PatternDisruptorPartOfSpeechSettings {
  noun: boolean
  verb: boolean
  adjective: boolean
  adverb: boolean
}

export interface PatternDisruptorRandomWordsSettings {
  enabled: boolean
  wordCount: number
  mode: PatternDisruptorGenerationMode
  wordLength: number
  partsOfSpeech: PatternDisruptorPartOfSpeechSettings
  wordHistorySize: number
  blacklist: string[]
  injectionDepth: number
  injectionRole: PatternDisruptorInjectionRole
  customPrompt: string
}

export interface PatternDisruptorSynonymSettings {
  enabled: boolean
  scanDepth: number
  minOccurrences: number
  topN: number
  outputMode: 'with-suggestions' | 'avoid-only'
  injectionDepth: number
  injectionRole: PatternDisruptorInjectionRole
  customPrompt: string
  customPromptRow: string
}

export interface PatternDisruptorSettings {
  enabled: boolean
  language: PatternDisruptorLanguage
  maxPromptWords: number
  randomWords: PatternDisruptorRandomWordsSettings
  synonyms: PatternDisruptorSynonymSettings
}

export type PatternDisruptorSettingsInput = Partial<
  Omit<PatternDisruptorSettings, 'randomWords' | 'synonyms'> & {
    randomWords: Partial<
      Omit<PatternDisruptorRandomWordsSettings, 'partsOfSpeech'> & {
        partsOfSpeech: Partial<PatternDisruptorPartOfSpeechSettings>
      }
    >
    synonyms: Partial<PatternDisruptorSynonymSettings>
  }
>

export type WordBankEntry = readonly [word: string, partOfSpeech: PatternDisruptorPartOfSpeechCode, rank: number]

export interface SynonymEntry {
  s: string[]
  a: string[]
}

export type SynonymMap = Record<string, SynonymEntry>

export interface PatternDisruptorSynonymSuggestion {
  originalWord: string
  normalizedWord: string
  count: number
  synonyms: string[]
}

export interface PatternDisruptorBuildInput {
  settings?: PatternDisruptorSettingsInput
  userMessage: string
  assistantMessages?: string[]
  wordHistory?: Iterable<string>
  random?: () => number
}

export interface PatternDisruptorBuildResult {
  text: string
  words: string[]
  synonymRows: PatternDisruptorSynonymSuggestion[]
  metadata: {
    language: ResolvedPatternDisruptorLanguage
    estimatedWords: number
    randomWordsEnabled: boolean
    synonymsEnabled: boolean
  }
}
