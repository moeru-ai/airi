import type { ResolvedPatternDisruptorLanguage, SynonymMap } from '../types'

import enSynonyms from '../../assets/en/synonyms.json'
import ruSynonyms from '../../assets/ru/synonyms.json'

const SYNONYM_MAPS: Record<ResolvedPatternDisruptorLanguage, SynonymMap> = {
  en: enSynonyms as SynonymMap,
  ru: ruSynonyms as SynonymMap,
}

export function getSynonymMap(language: ResolvedPatternDisruptorLanguage): SynonymMap {
  return SYNONYM_MAPS[language]
}
