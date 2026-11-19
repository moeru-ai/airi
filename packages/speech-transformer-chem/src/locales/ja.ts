import type { ChemLocale } from '../locale'

import { spellNumber } from '@proj-airi/speech-transformer-math'

import { compoundNames } from './names-ja'

/** The Japanese words of chemistry. */
export const ja: ChemLocale = {
  language: 'ja',
  names: compoundNames,
  formula: species => species.formula,
  ion: (formula, charge) => `${formula} ${spellNumber(charge.slice(0, -1) || '1', 'ja')}価の${charge.endsWith('+') ? '陽' : '陰'}イオン`,
  // A textbook reads an equation by its substances, as Chinese does. 分子 counts molecules, but metals, ionic solids,
  // and ions are not molecules, so に分子のナトリウム is wrong. Coefficients are not read.
  term: name => name,
  and: (l, r) => `${l}と${r}`,
  arrow: {
    '->': (r, p) => `${r}が反応して ${p}ができる`,
    '<=>': (r, p) => `${r}が可逆的に反応して ${p}ができる`,
    '<-': (r, p) => `${p}が反応して ${r}ができる`,
  },
  decompose: (r, p) => `${r}が分解して ${p}ができる`,
  condition: (c, e) => `${c}の条件で ${e}`,
  gas: '気体',
  heat: '加熱',
  precipitate: '沈殿',
  spellsFormula: true,
  open: 'かっこ',
  close: 'かっことじ',
  hydrate: 'ドット',
}
