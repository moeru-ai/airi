export { detectPatternDisruptorLanguage, resolvePatternDisruptorLanguage, tokenizeWords } from './data/language'
export { getSynonymMap } from './data/synonyms'
export { getWordBank } from './data/words'
export { buildPatternDisruptorSupplement } from './engine/injector'
export { generateRandomWords } from './engine/random-words'
export { scanSynonymOveruse } from './engine/synonym-scanner'
export {
  DEFAULT_PATTERN_DISRUPTOR_SETTINGS,
  DEFAULT_RANDOM_WORDS_PROMPT,
  DEFAULT_SYNONYM_PROMPT,
  DEFAULT_SYNONYM_ROW_PROMPT,
  resolvePatternDisruptorSettings,
} from './settings'
export type {
  PatternDisruptorBuildInput,
  PatternDisruptorBuildResult,
  PatternDisruptorGenerationMode,
  PatternDisruptorInjectionRole,
  PatternDisruptorLanguage,
  PatternDisruptorPartOfSpeechCode,
  PatternDisruptorPartOfSpeechName,
  PatternDisruptorPartOfSpeechSettings,
  PatternDisruptorRandomWordsSettings,
  PatternDisruptorSettings,
  PatternDisruptorSettingsInput,
  PatternDisruptorSynonymSettings,
  PatternDisruptorSynonymSuggestion,
  ResolvedPatternDisruptorLanguage,
  SynonymEntry,
  SynonymMap,
  WordBankEntry,
} from './types'
