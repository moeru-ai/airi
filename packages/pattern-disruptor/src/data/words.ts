import type { ResolvedPatternDisruptorLanguage, WordBankEntry } from '../types'

import enWords from '../../assets/en/words.json'
import ruWords from '../../assets/ru/words.json'

const WORD_BANKS: Record<ResolvedPatternDisruptorLanguage, WordBankEntry[]> = {
  en: enWords as unknown as WordBankEntry[],
  ru: ruWords as unknown as WordBankEntry[],
}

export function getWordBank(language: ResolvedPatternDisruptorLanguage): WordBankEntry[] {
  return WORD_BANKS[language]
}
