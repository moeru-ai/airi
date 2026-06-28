import type {
  PatternDisruptorGenerationMode,
  PatternDisruptorInjectionRole,
  PatternDisruptorLanguage,
  PatternDisruptorPartOfSpeechSettings,
  PatternDisruptorSettings,
  PatternDisruptorSettingsInput,
  PatternDisruptorSynonymSettings,
} from './types'

export const DEFAULT_RANDOM_WORDS_PROMPT =
  '[NARRATIVE OVERDRIVE: You must naturally incorporate the following words into your response: {{words}}. Use each word at least once, weaving them seamlessly into the narrative flow. Do not bold, italicize, quote, or call attention to these words.]'

export const DEFAULT_SYNONYM_PROMPT =
  '[WORD FRESHNESS: The following words have been used frequently. Avoid reusing them; vary your vocabulary.\n{{rows}}]'

export const DEFAULT_SYNONYM_ROW_PROMPT = '- "{{originalWord}}" ({{count}}x) - try: {{synonyms}}'

export const DEFAULT_PATTERN_DISRUPTOR_SETTINGS: PatternDisruptorSettings = {
  enabled: false,
  language: 'auto',
  maxPromptWords: 140,
  randomWords: {
    enabled: true,
    wordCount: 3,
    mode: 'random',
    wordLength: 0,
    partsOfSpeech: {
      noun: true,
      verb: true,
      adjective: true,
      adverb: false,
    },
    wordHistorySize: 50,
    blacklist: [],
    injectionDepth: 0,
    injectionRole: 'system',
    customPrompt: DEFAULT_RANDOM_WORDS_PROMPT,
  },
  synonyms: {
    enabled: true,
    scanDepth: 10,
    minOccurrences: 5,
    topN: 3,
    outputMode: 'with-suggestions',
    injectionDepth: 0,
    injectionRole: 'system',
    customPrompt: DEFAULT_SYNONYM_PROMPT,
    customPromptRow: DEFAULT_SYNONYM_ROW_PROMPT,
  },
}

function cloneDefaults(): PatternDisruptorSettings {
  return {
    ...DEFAULT_PATTERN_DISRUPTOR_SETTINGS,
    randomWords: {
      ...DEFAULT_PATTERN_DISRUPTOR_SETTINGS.randomWords,
      partsOfSpeech: { ...DEFAULT_PATTERN_DISRUPTOR_SETTINGS.randomWords.partsOfSpeech },
      blacklist: [...DEFAULT_PATTERN_DISRUPTOR_SETTINGS.randomWords.blacklist],
    },
    synonyms: { ...DEFAULT_PATTERN_DISRUPTOR_SETTINGS.synonyms },
  }
}

function clampInteger(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, Math.round(value)))
}

function resolveLanguage(value: unknown, fallback: PatternDisruptorLanguage): PatternDisruptorLanguage {
  return value === 'auto' || value === 'en' || value === 'ru' ? value : fallback
}

function resolveGenerationMode(
  value: unknown,
  fallback: PatternDisruptorGenerationMode,
): PatternDisruptorGenerationMode {
  return value === 'random' || value === 'double-pass' || value === 'contextual' ? value : fallback
}

function resolveInjectionRole(value: unknown, fallback: PatternDisruptorInjectionRole): PatternDisruptorInjectionRole {
  return value === 'system' || value === 'user' || value === 'assistant' ? value : fallback
}

function resolveBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function resolveString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value : fallback
}

function resolveStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
}

function resolvePartsOfSpeech(
  input: PatternDisruptorSettingsInput['randomWords'] | undefined,
  defaults: PatternDisruptorPartOfSpeechSettings,
): PatternDisruptorPartOfSpeechSettings {
  return {
    noun: resolveBoolean(input?.partsOfSpeech?.noun, defaults.noun),
    verb: resolveBoolean(input?.partsOfSpeech?.verb, defaults.verb),
    adjective: resolveBoolean(input?.partsOfSpeech?.adjective, defaults.adjective),
    adverb: resolveBoolean(input?.partsOfSpeech?.adverb, defaults.adverb),
  }
}

function resolveSynonymOutputMode(value: unknown, fallback: PatternDisruptorSynonymSettings['outputMode']) {
  return value === 'with-suggestions' || value === 'avoid-only' ? value : fallback
}

export function resolvePatternDisruptorSettings(input?: PatternDisruptorSettingsInput): PatternDisruptorSettings {
  const defaults = cloneDefaults()
  const randomWords = input?.randomWords
  const synonyms = input?.synonyms

  return {
    enabled: resolveBoolean(input?.enabled, defaults.enabled),
    language: resolveLanguage(input?.language, defaults.language),
    maxPromptWords: clampInteger(input?.maxPromptWords, defaults.maxPromptWords, 20, 300),
    randomWords: {
      enabled: resolveBoolean(randomWords?.enabled, defaults.randomWords.enabled),
      wordCount: clampInteger(randomWords?.wordCount, defaults.randomWords.wordCount, 1, 8),
      mode: resolveGenerationMode(randomWords?.mode, defaults.randomWords.mode),
      wordLength: clampInteger(randomWords?.wordLength, defaults.randomWords.wordLength, 0, 24),
      partsOfSpeech: resolvePartsOfSpeech(randomWords, defaults.randomWords.partsOfSpeech),
      wordHistorySize: clampInteger(randomWords?.wordHistorySize, defaults.randomWords.wordHistorySize, 0, 200),
      blacklist: resolveStringArray(randomWords?.blacklist),
      injectionDepth: clampInteger(randomWords?.injectionDepth, defaults.randomWords.injectionDepth, 0, 8),
      injectionRole: resolveInjectionRole(randomWords?.injectionRole, defaults.randomWords.injectionRole),
      customPrompt: resolveString(randomWords?.customPrompt, defaults.randomWords.customPrompt),
    },
    synonyms: {
      enabled: resolveBoolean(synonyms?.enabled, defaults.synonyms.enabled),
      scanDepth: clampInteger(synonyms?.scanDepth, defaults.synonyms.scanDepth, 1, 40),
      minOccurrences: clampInteger(synonyms?.minOccurrences, defaults.synonyms.minOccurrences, 2, 20),
      topN: clampInteger(synonyms?.topN, defaults.synonyms.topN, 1, 8),
      outputMode: resolveSynonymOutputMode(synonyms?.outputMode, defaults.synonyms.outputMode),
      injectionDepth: clampInteger(synonyms?.injectionDepth, defaults.synonyms.injectionDepth, 0, 8),
      injectionRole: resolveInjectionRole(synonyms?.injectionRole, defaults.synonyms.injectionRole),
      customPrompt: resolveString(synonyms?.customPrompt, defaults.synonyms.customPrompt),
      customPromptRow: resolveString(synonyms?.customPromptRow, defaults.synonyms.customPromptRow),
    },
  }
}
