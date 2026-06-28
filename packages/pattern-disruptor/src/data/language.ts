import type {
  PatternDisruptorLanguage,
  PatternDisruptorPartOfSpeechCode,
  PatternDisruptorPartOfSpeechName,
  ResolvedPatternDisruptorLanguage,
} from '../types'

const CYRILLIC_RE = /[\u0400-\u04FF]/u
const WORD_RE = /[\p{L}][\p{L}'-]*/gu

const RU_KNOWN_NORMAL_FORMS = new Set([
  'брести',
  'вбок',
  'гавань',
  'горизонт',
  'заря',
  'задержаться',
  'зубчатый',
  'идти',
  'искра',
  'история',
  'компас',
  'ловкий',
  'любопытный',
  'мох',
  'мягкий',
  'мягко',
  'нежный',
  'плести',
  'почти',
  'порог',
  'разжечь',
  'рассыпать',
  'рябь',
  'сад',
  'собирать',
  'серебряный',
  'сложить',
  'смело',
  'тепло',
  'теплый',
  'терпеливый',
  'тихий',
  'тихо',
  'фонарь',
  'хороший',
  'яркий',
])

const RU_INFLECTIONS = new Map([
  ['историю', 'история'],
  ['истории', 'история'],
  ['историей', 'история'],
  ['историях', 'история'],
  ['саду', 'сад'],
  ['садом', 'сад'],
  ['саде', 'сад'],
  ['сада', 'сад'],
  ['сады', 'сад'],
  ['яркая', 'яркий'],
  ['яркую', 'яркий'],
  ['яркое', 'яркий'],
  ['яркие', 'яркий'],
  ['яркого', 'яркий'],
  ['яркому', 'яркий'],
  ['ярким', 'яркий'],
  ['ярких', 'яркий'],
])

const RU_SUFFIX_RULES: Array<{ suffix: string; replacements: string[] }> = [
  { suffix: 'иями', replacements: ['ия'] },
  { suffix: 'ями', replacements: ['я'] },
  { suffix: 'ами', replacements: [''] },
  { suffix: 'ого', replacements: ['ый', 'ий'] },
  { suffix: 'ему', replacements: ['ый', 'ий'] },
  { suffix: 'ыми', replacements: ['ый', 'ий'] },
  { suffix: 'ими', replacements: ['ый', 'ий'] },
  { suffix: 'ую', replacements: ['ый', 'ий', 'ая'] },
  { suffix: 'юю', replacements: ['яя'] },
  { suffix: 'ая', replacements: ['ый', 'ий'] },
  { suffix: 'яя', replacements: ['ий'] },
  { suffix: 'ое', replacements: ['ый', 'ий'] },
  { suffix: 'ее', replacements: ['ий'] },
  { suffix: 'ые', replacements: ['ый'] },
  { suffix: 'ие', replacements: ['ий'] },
  { suffix: 'ом', replacements: ['', 'ый', 'ий'] },
  { suffix: 'ем', replacements: ['ий'] },
  { suffix: 'ах', replacements: [''] },
  { suffix: 'ях', replacements: ['я'] },
  { suffix: 'ам', replacements: [''] },
  { suffix: 'ям', replacements: ['я'] },
  { suffix: 'ов', replacements: [''] },
  { suffix: 'ев', replacements: [''] },
  { suffix: 'у', replacements: ['', 'а', 'я'] },
  { suffix: 'ю', replacements: ['я'] },
  { suffix: 'е', replacements: ['', 'я'] },
  { suffix: 'ы', replacements: ['', 'а'] },
  { suffix: 'и', replacements: ['я', 'ий'] },
  { suffix: 'а', replacements: ['', 'я'] },
]

const ENGLISH_SUFFIX_RULES: Array<{ suffix: string; minLength: number; replacement: string }> = [
  { suffix: 'ies', minLength: 5, replacement: 'y' },
  { suffix: 'ing', minLength: 7, replacement: '' },
  { suffix: 'ed', minLength: 6, replacement: '' },
  { suffix: 'ly', minLength: 6, replacement: '' },
]

const STOPWORDS: Record<ResolvedPatternDisruptorLanguage, Set<string>> = {
  en: new Set([
    'about',
    'after',
    'again',
    'also',
    'and',
    'are',
    'because',
    'been',
    'but',
    'can',
    'could',
    'for',
    'from',
    'have',
    'into',
    'just',
    'like',
    'more',
    'not',
    'now',
    'that',
    'the',
    'their',
    'then',
    'there',
    'this',
    'was',
    'were',
    'with',
    'you',
    'your',
  ]),
  ru: new Set([
    'без',
    'был',
    'была',
    'были',
    'быть',
    'вам',
    'вас',
    'все',
    'для',
    'его',
    'если',
    'есть',
    'как',
    'когда',
    'мне',
    'может',
    'над',
    'она',
    'они',
    'оно',
    'при',
    'про',
    'так',
    'там',
    'тебя',
    'тем',
    'что',
    'это',
  ]),
}

export const PART_OF_SPEECH_CODE_BY_NAME: Record<PatternDisruptorPartOfSpeechName, PatternDisruptorPartOfSpeechCode> = {
  noun: 'n',
  verb: 'v',
  adjective: 'a',
  adverb: 'r',
}

export function detectPatternDisruptorLanguage(text: string): ResolvedPatternDisruptorLanguage {
  return CYRILLIC_RE.test(text) ? 'ru' : 'en'
}

export function resolvePatternDisruptorLanguage(
  language: PatternDisruptorLanguage,
  userMessage: string,
): ResolvedPatternDisruptorLanguage {
  if (language === 'auto') return detectPatternDisruptorLanguage(userMessage)
  return language
}

export function tokenizeWords(text: string): string[] {
  return text.match(WORD_RE)?.map((token) => token.toLowerCase()) ?? []
}

function applyEnglishSuffixRule(token: string): string | undefined {
  const rule = ENGLISH_SUFFIX_RULES.find((item) => token.endsWith(item.suffix) && token.length >= item.minLength)
  if (!rule) return undefined
  return `${token.slice(0, -rule.suffix.length)}${rule.replacement}`
}

function isDroppableEnglishPlural(token: string): boolean {
  return (
    token.length > 4 && token.endsWith('s') && !token.endsWith('ss') && !token.endsWith('us') && !token.endsWith('ous')
  )
}

function normalizeEnglishToken(token: string): string {
  const withoutContraction = token.replace(/'(s|re|ve|ll|d)$/u, '')
  const suffixNormalized = applyEnglishSuffixRule(withoutContraction)
  if (suffixNormalized) return suffixNormalized
  return isDroppableEnglishPlural(withoutContraction) ? withoutContraction.slice(0, -1) : withoutContraction
}

function getKnownRussianSuffixCandidate(token: string): string | undefined {
  for (const rule of RU_SUFFIX_RULES) {
    if (!token.endsWith(rule.suffix) || token.length <= rule.suffix.length + 1) continue

    const stem = token.slice(0, -rule.suffix.length)
    const candidate = rule.replacements
      .map((replacement) => `${stem}${replacement}`)
      .find((word) => RU_KNOWN_NORMAL_FORMS.has(word))
    if (candidate) return candidate
  }
}

function normalizeRussianToken(token: string): string {
  if (RU_KNOWN_NORMAL_FORMS.has(token)) return token
  return RU_INFLECTIONS.get(token) ?? getKnownRussianSuffixCandidate(token) ?? token
}

export function normalizeToken(token: string, language: ResolvedPatternDisruptorLanguage): string {
  const lower = token.toLowerCase().replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '')
  return language === 'ru' ? normalizeRussianToken(lower) : normalizeEnglishToken(lower)
}

export function isStopword(token: string, language: ResolvedPatternDisruptorLanguage): boolean {
  return STOPWORDS[language].has(token)
}
